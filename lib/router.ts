import type { BunRequest, HTMLBundle } from "bun";
import { compose } from "./compose";
import { createContext } from "./context";
import type {
    ErrorHandlerList,
    ErrorRouteHandler,
    HandlerLike,
    IResponse,
    IRequest,
    Method,
    ParamHandler,
    RouteHandler,
    RouteInfo,
    RouterOptions,
    StaticBundle,
    NextFunction,
    BunRoutes
} from "./types";
import {
    flattenHandlers,
    getRequestMethod,
    getRequestUrl,
    isErrorHandler,
    isRouteHandler,
    isValidPath,
    joinPath,
    matchRoute,
    methods,
    parseUrl,
    sanitizeParams,
    METHODS,
} from "./utils";

type RouteLayer = {
    kind: "route";
    path: string;
    route: Route;
};

type MiddlewareLayer = {
    kind: "middleware";
    path: string;
    handlers: HandlerLike[];
};

type RouterLayer = {
    kind: "router";
    path: string;
    router: Router;
};

type Layer = RouteLayer | MiddlewareLayer | RouterLayer;

type RouteStackItem = {
    methods: Set<Method | "ALL">;
    handlers: RouteHandler[];
};

function runHandlers(
    handlers: HandlerLike[],
    req: IRequest,
    res: IResponse,
    done: (err?: unknown, advanced?: boolean) => void,
    initialError?: unknown,
): void {
    let index = 0;

    const dispatch = (err?: unknown): void => {
        while (index < handlers.length) {
            const handler = handlers[index++];
            const expectsError = isErrorHandler(handler);

            if (err !== undefined && !expectsError) {
                continue;
            }

            if (err === undefined && expectsError) {
                continue;
            }

            let called = false;

            const next = (nextErr?: unknown) => {
                if (called) {
                    throw new Error("next() called multiple times");
                }

                called = true;
                dispatch(nextErr);
            };

            try {
                const result = expectsError
                    ? (handler as any)(err, req, res, next)
                    : (handler as RouteHandler)(req, res, next);

                if (result && typeof (result as Promise<unknown>).then === "function") {
                    (result as Promise<unknown>)
                        .then(value => {
                            if (value !== undefined) {
                                done(undefined, false);
                                return;
                            }

                            if (!called) {
                                done(undefined, false);
                            }
                        })
                        .catch(error => dispatch(error));
                    return;
                }

                if (result !== undefined) {
                    done(undefined, false);
                    return;
                }

                if (!called) {
                    done(undefined, false);
                    return;
                }
            } catch (error) {
                dispatch(error);
            }

            return;
        }

        done(err, true);
    };

    dispatch(initialError);
}

export class Route {
    private readonly stack: RouteStackItem[] = [];

    constructor(public readonly path: string) { }

    private add(methodsToAdd: Array<Method | "ALL">, args: unknown[]) {
        const handlers = flattenHandlers(args);

        if (handlers.some(isErrorHandler)) {
            throw new TypeError("route handlers must be standard middleware functions");
        }

        this.stack.push({
            methods: new Set(methodsToAdd),
            handlers: handlers as RouteHandler[],
        });

        return this;
    }
    // get(...handlers: RouteHandler[]): this;
    get(...handlers: RouteHandler[]): this {
        return this.add(["GET"], handlers);
    }

    // post(...handlers: RouteHandler[]): this;
    post(...handlers: RouteHandler[]): this {
        return this.add(["POST"], handlers);
    }

    // put(...handlers: RouteHandler[]): this;
    put(...handlers: RouteHandler[]): this {
        return this.add(["PUT"], handlers);
    }

    // patch(...handlers: RouteHandler[]): this;
    patch(...handlers: RouteHandler[]): this {
        return this.add(["PATCH"], handlers);
    }

    // delete(...handlers: RouteHandler[]): this;
    delete(...handlers: RouteHandler[]): this {
        return this.add(["DELETE"], handlers);
    }

    // options(...handlers: RouteHandler[]): this;
    options(...handlers: RouteHandler[]): this {
        return this.add(["OPTIONS"], handlers);
    }

    // all(...handlers: RouteHandler[]): this;
    all(...handlers: RouteHandler[]): this {
        return this.add(["ALL"], handlers);
    }

    getStack() {
        return this.stack;
    }
}

type CompiledEndpoint = {
    path: string;
    method: Method;
    handlers: HandlerLike[];
};

type ParamCache = Record<string, { value: string; error?: unknown }>;

export class Router {
    private readonly layers: Layer[] = [];
    private readonly paramHandlers: Map<string, ParamHandler[]> = new Map();
    private readonly htmlBundles: StaticBundle[] = [];

    private readonly maxNestingDepth: number;
    private readonly routerOptions?: RouterOptions;

    constructor(options?: RouterOptions) {
        this.maxNestingDepth = options?.maxNestingDepth ?? 30;
        this.routerOptions = options;

        const callable = this.handle.bind(this) as Router & ((req: IRequest, res: IResponse, next: NextFunction) => void);
        Object.setPrototypeOf(callable, new.target.prototype);
        Object.assign(callable, this);
        return callable;
    }

    route(path: string) {
        if (!isValidPath(path)) {
            throw new Error(`Invalid path: ${path}`);
        }

        const route = new Route(path);

        this.layers.push({
            kind: "route",
            path,
            route,
        });

        return route;
    }

    use(...handlers: RouteHandler[]): this;
    use(...handlers: ErrorRouteHandler[]): this;
    use(handlers: RouteHandler[], ...rest: RouteHandler[]): this;
    use(handlers: ErrorHandlerList, ...rest: ErrorRouteHandler[]): this;
    use(path: string, ...handlers: RouteHandler[]): this;
    use(path: string, ...handlers: ErrorRouteHandler[]): this;
    use(path: string, handlers: RouteHandler[], ...rest: RouteHandler[]): this;
    use(path: string, handlers: ErrorHandlerList, ...rest: ErrorRouteHandler[]): this;
    use(path: string, router: Router): this;
    use(...args: unknown[]) {
        if (args.length === 0) {
            throw new TypeError("argument handler is required");
        }

        let prefix = "/";
        let values = args;

        if (typeof args[0] === "string") {
            prefix = args[0] as string;
            values = args.slice(1);

            if (values.length === 0) {
                throw new TypeError("argument handler is required");
            }
        }

        if (values.length === 1 && values[0] instanceof Router) {
            this.layers.push({
                kind: "router",
                path: prefix,
                router: values[0],
            });
            return this;
        }

        const handlers = flattenHandlers(values);

        this.layers.push({
            kind: "middleware",
            path: prefix,
            handlers,
        });

        return this;
    }

    // param(name: string, fn?: ParamHandler): this;
    param(name: string, fn?: ParamHandler): this {
        if (!name) {
            throw new TypeError("argument name is required");
        }

        if (typeof fn !== "function") {
            if (fn === undefined) {
                throw new TypeError("argument fn is required");
            }

            throw new TypeError("argument fn must be a function");
        }

        const current = this.paramHandlers.get(name) ?? [];
        current.push(fn as ParamHandler);
        this.paramHandlers.set(name, current);

        return this;
    }

    // get(path: string, ...handlers: RouteHandler[]): this;
    get(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).get(...handlers as RouteHandler[]);
        return this;
    }

    // post(path: string, ...handlers: RouteHandler[]): this;
    post(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).post(...handlers as RouteHandler[]);
        return this;
    }

    // put(path: string, ...handlers: RouteHandler[]): this;
    put(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).put(...handlers as RouteHandler[]);
        return this;
    }

    // patch(path: string, ...handlers: RouteHandler[]): this;
    patch(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).patch(...handlers as RouteHandler[]);
        return this;
    }

    // delete(path: string, ...handlers: RouteHandler[]): this;
    delete(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).delete(...handlers as RouteHandler[]);
        return this;
    }

    // options(path: string, ...handlers: RouteHandler[]): this;
    options(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).options(...handlers as RouteHandler[]);
        return this;
    }

    // all(path: string, ...handlers: RouteHandler[]): this;
    all(path: string, ...handlers: RouteHandler[]): this {
        this.route(path).all(...handlers as RouteHandler[]);
        return this;
    }

    bundle(path: string, bundle: HTMLBundle) {
        if (!isValidPath(path)) {
            throw new Error(`Invalid bundle path: ${path}`);
        }

        this.htmlBundles.push({
            prefix: path,
            bundle,
        });

        return this;
    }

    private createHandleContext(req: unknown, res: unknown) {
        const inputReq = req as Record<string, unknown> & {
            method?: string;
            url?: string;
            originalUrl?: string;
            baseUrl?: string;
            state?: Record<string, unknown>;
            params?: Record<string, string>;
            _paramCache?: ParamCache;
        };

        const inputRes = res as Record<string, unknown> & {
            locals?: Record<string, unknown>;
            json?: (data: unknown, init?: ResponseInit) => Response;
            text?: (data: string, init?: ResponseInit) => Response;
            end?: (data?: string | Buffer, encoding?: string, callback?: () => Response) => Response | unknown;
        };

        const requestContext = inputReq as unknown as IRequest;
        requestContext.raw = (inputReq.raw as Request | undefined) ?? ({} as Request);
        requestContext.method = getRequestMethod(inputReq);
        requestContext.url = getRequestUrl(inputReq);
        requestContext.originalUrl = (typeof inputReq.originalUrl === "string" && inputReq.originalUrl.length > 0)
            ? inputReq.originalUrl
            : getRequestUrl(inputReq);
        requestContext.baseUrl = (typeof inputReq.baseUrl === "string") ? inputReq.baseUrl : "";
        requestContext.params = { ...(inputReq.params ?? {}) };
        requestContext.state = (inputReq.state ?? {}) as Record<string, any>;

        const originalJson = typeof inputRes.json === "function"
            ? inputRes.json.bind(inputRes)
            : undefined;

        const originalText = typeof inputRes.text === "function"
            ? inputRes.text.bind(inputRes)
            : undefined;

        const originalSend = typeof (inputRes as { send?: unknown }).send === "function"
            ? (inputRes as { send: (data: unknown, init?: ResponseInit) => unknown }).send.bind(inputRes)
            : undefined;

        const originalEnd = typeof inputRes.end === "function"
            ? inputRes.end.bind(inputRes)
            : undefined;

        const responseState: { current?: Response } = {};
        const responseContext = inputRes as unknown as IResponse & { __response?: Response };

        responseContext.locals = (inputRes.locals ?? {}) as Record<string, unknown>;

        responseContext.json = (data: unknown, init?: ResponseInit) => {
            const payload = originalJson ? originalJson(data, init) : Response.json(data, init);
            responseState.current = payload;
            return payload;
        };

        responseContext.text = (data: string, init?: ResponseInit) => {
            const payload = originalText ? originalText(data, init) : new Response(data, init);
            responseState.current = payload;
            return payload;
        };

        responseContext.send = (data: unknown, init?: ResponseInit) => {
            if (originalSend) {
                const payload = originalSend(data, init);

                if (payload instanceof Response) {
                    responseState.current = payload;
                    return payload;
                }

                return payload;
            }

            if (typeof data === "string") {
                const payload = new Response(data, init);
                responseState.current = payload;
                return payload;
            }

            const payload = Response.json(data, init);
            responseState.current = payload;
            return payload;
        };

        responseContext.end = (data?: string | Buffer, encoding?: string, callback?: () => Response) => {
            const payload = originalEnd
                ? originalEnd(data, encoding, callback)
                : new Response((data ?? "") as BodyInit);

            if (payload instanceof Response) {
                responseState.current = payload;
                return payload;
            }

            const fallback = callback?.() ?? new Response((data ?? "") as BodyInit);
            responseState.current = fallback;
            return fallback;
        };

        responseContext.__response = responseState.current;

        return { req: requestContext, res: responseContext };
    }

    private getAllParamHandlers(name: string): ParamHandler[] {
        return this.paramHandlers.get(name) ?? [];
    }

    private async runParamCallbacks(
        req: IRequest,
        res: IResponse,
        params: Record<string, string>,
    ) {
        const cache = (req as IRequest & { _paramCache?: ParamCache })._paramCache ?? ((req as IRequest & { _paramCache?: ParamCache })._paramCache = {});

        const names = Object.keys(params);
        for (const name of names) {
            const value = params[name];
            if (value === undefined) {
                continue;
            }
            const handlers = this.getAllParamHandlers(name);

            if (handlers.length === 0) {
                continue;
            }

            const cached = cache[name];
            if (cached && cached.value === value) {
                if (cached.error !== undefined) {
                    throw cached.error;
                }
                continue;
            }

            for (const handler of handlers) {
                await new Promise<void>((resolve, reject) => {
                    let called = false;

                    const next = (err?: unknown) => {
                        if (called) {
                            return;
                        }

                        called = true;

                        if (err !== undefined) {
                            reject(err);
                            return;
                        }

                        resolve();
                    };

                    Promise.resolve(handler(req, res, next, value, name)).catch(reject);
                });
            }

            cache[name] = { value };
        }
    }

    private applyMatchedParams(
        req: IRequest,
        res: IResponse,
        params: Record<string, string>,
    ): Promise<void> | void {
        const sanitized = sanitizeParams(params);
        req.params = {
            ...req.params,
            ...sanitized,
        };

        if (Object.keys(sanitized).length === 0) {
            return;
        }

        return this.runParamCallbacks(req, res, sanitized);
    }

    private applyTrimmedUrl(req: IRequest, path: string, pathname: string) {
        const parsed = parseUrl(req.originalUrl ?? req.url ?? "/");
        const matched = matchRoute(path, pathname, false);

        const previous = {
            url: req.url,
            baseUrl: req.baseUrl,
        };

        let consumedPath = matched.consumedPath;
        let remainder = matched.pathRemainder === "/" ? "/" : matched.pathRemainder;

        if (!path.includes(":") && !path.includes("*")) {
            const normalizedPath = path === "/"
                ? "/"
                : path.replace(/\/$/, "");

            if (normalizedPath === "/") {
                consumedPath = "";
                remainder = pathname || "/";
            } else if (pathname === normalizedPath || pathname.startsWith(`${normalizedPath}/`)) {
                consumedPath = normalizedPath;
                const tail = pathname.slice(normalizedPath.length);
                remainder = tail.length === 0 ? "/" : (tail.startsWith("/") ? tail : `/${tail}`);
            }
        }

        const nextBase = `${req.baseUrl ?? ""}${consumedPath}`;

        req.baseUrl = nextBase;
        req.url = `${parsed.fqdnPrefix}${remainder}${parsed.search}`;

        return () => {
            req.url = previous.url;
            req.baseUrl = previous.baseUrl;
        };
    }

    private routeMatchesMethod(route: Route, method?: string): boolean {
        const upperMethod = method?.toUpperCase();

        return route.getStack().some(layer => {
            if (layer.methods.has("ALL")) {
                return true;
            }

            if (!upperMethod) {
                return false;
            }

            return layer.methods.has(upperMethod as Method);
        });
    }

    private getRouteHandlersForMethod(route: Route, method?: string): RouteHandler[] {
        const upperMethod = method?.toUpperCase();

        const handlers: RouteHandler[] = [];

        for (const layer of route.getStack()) {
            if (layer.methods.has("ALL")) {
                handlers.push(...layer.handlers);
                continue;
            }

            if (!upperMethod) {
                continue;
            }

            if (layer.methods.has(upperMethod as Method)) {
                handlers.push(...layer.handlers);
            }
        }

        return handlers;
    }

    handle(req: unknown, res: unknown, callback: (err?: any) => void) {
        if (typeof callback !== "function") {
            throw new TypeError("argument callback is required");
        }

        const rawUrl = (req as { url?: unknown })?.url;
        if (typeof rawUrl !== "string" || rawUrl.length === 0) {
            callback(undefined);
            return;
        }

        const methodRaw = (req as { method?: unknown })?.method;
        const method = typeof methodRaw === "string" ? methodRaw.toUpperCase() : undefined;
        const { req: requestContext, res: responseContext } = this.createHandleContext(req, res);
        const response = res as { end?: (...args: unknown[]) => unknown };
        const originalEnd = typeof response.end === "function" ? response.end.bind(response) : undefined;

        let finished = false;

        const finish = (err?: unknown) => {
            if (finished) {
                return;
            }

            finished = true;

            if (originalEnd) {
                response.end = originalEnd;
            }

            callback(err);
        };

        if (originalEnd) {
            response.end = (...args: unknown[]) => {
                const result = originalEnd(...args);
                finish(undefined);
                return result;
            };
        }

        if (!(req as { originalUrl?: string }).originalUrl) {
            requestContext.originalUrl = requestContext.url;
        }

        let hopCount = 0;

        const advance = (nextIndex: number, nextErr?: unknown) => {
            hopCount += 1;

            if (hopCount % 128 === 0) {
                queueMicrotask(() => processLayer(nextIndex, nextErr));
                return;
            }

            processLayer(nextIndex, nextErr);
        };

        const processLayer = (index: number, err?: unknown): void => {
            if (index >= this.layers.length) {
                finish(err);
                return;
            }

            const layer = this.layers[index];
            if (!layer) {
                finish(err);
                return;
            }
            const currentPath = parseUrl(requestContext.url).pathname || "/";
            const matched = matchRoute(layer.path, currentPath, layer.kind === "route");

            if (!matched.matched) {
                advance(index + 1, err);
                return;
            }

            if (layer.kind === "middleware") {
                const middlewareLayer = layer;
                const snapshot = {
                    url: requestContext.url,
                    baseUrl: requestContext.baseUrl,
                    params: { ...requestContext.params },
                };

                const restoreUrl = this.applyTrimmedUrl(requestContext, middlewareLayer.path, currentPath);
                const restoreAndAdvance = (nextErr?: unknown) => {
                    restoreUrl();
                    requestContext.url = snapshot.url;
                    requestContext.baseUrl = snapshot.baseUrl;
                    requestContext.params = snapshot.params;
                    advance(index + 1, nextErr ?? err);
                };

                const applied = this.applyMatchedParams(requestContext, responseContext, matched.params);
                if (applied && typeof (applied as Promise<void>).then === "function") {
                    (applied as Promise<void>)
                        .then(() => {
                            runHandlers(
                                middlewareLayer.handlers,
                                requestContext,
                                responseContext,
                                (layerErr, advanced) => {
                                    if (advanced) {
                                        restoreAndAdvance(layerErr);
                                        return;
                                    }

                                    finish(layerErr ?? err);
                                },
                                err,
                            );
                        })
                        .catch(paramError => restoreAndAdvance(paramError));
                    return;
                }

                runHandlers(
                    middlewareLayer.handlers,
                    requestContext,
                    responseContext,
                    (layerErr, advanced) => {
                        if (advanced) {
                            restoreAndAdvance(layerErr);
                            return;
                        }

                        finish(layerErr ?? err);
                    },
                    err,
                );

                return;
            }

            if (layer.kind === "router") {
                const routerLayer = layer;
                const snapshot = {
                    url: requestContext.url,
                    baseUrl: requestContext.baseUrl,
                    params: { ...requestContext.params },
                };

                const restoreUrl = this.applyTrimmedUrl(requestContext, routerLayer.path, currentPath);
                const restoreAndAdvance = (nextErr?: unknown) => {
                    restoreUrl();
                    requestContext.url = snapshot.url;
                    requestContext.baseUrl = snapshot.baseUrl;
                    requestContext.params = snapshot.params;
                    advance(index + 1, nextErr ?? err);
                };

                const applied = this.applyMatchedParams(requestContext, responseContext, matched.params);
                if (applied && typeof (applied as Promise<void>).then === "function") {
                    (applied as Promise<void>)
                        .then(() => {
                            routerLayer.router.handle(requestContext, responseContext, (childErr?: unknown) => {
                                restoreAndAdvance(childErr);
                            });
                        })
                        .catch(paramError => restoreAndAdvance(paramError));
                    return;
                }

                routerLayer.router.handle(requestContext, responseContext, (childErr?: unknown) => {
                    restoreAndAdvance(childErr);
                });

                return;
            }

            const routeLayer = layer;

            if (!this.routeMatchesMethod(routeLayer.route, method)) {
                advance(index + 1, err);
                return;
            }

            const applied = this.applyMatchedParams(requestContext, responseContext, matched.params);
            if (applied && typeof (applied as Promise<void>).then === "function") {
                (applied as Promise<void>)
                    .then(() => {
                        const routeHandlers = this.getRouteHandlersForMethod(routeLayer.route, method);

                        runHandlers(
                            routeHandlers,
                            requestContext,
                            responseContext,
                            (routeErr, advanced) => {
                                if (advanced) {
                                    advance(index + 1, routeErr ?? err);
                                    return;
                                }

                                finish(routeErr ?? err);
                            },
                            err,
                        );
                    })
                    .catch(paramError => advance(index + 1, paramError));
                return;
            }

            const routeHandlers = this.getRouteHandlersForMethod(routeLayer.route, method);

            runHandlers(
                routeHandlers,
                requestContext,
                responseContext,
                (routeErr, advanced) => {
                    if (advanced) {
                        advance(index + 1, routeErr ?? err);
                        return;
                    }

                    finish(routeErr ?? err);
                },
                err,
            );
        };

        processLayer(0, undefined);
    }

    private compileEndpoints(
        basePath: string,
        inheritedMiddlewares: HandlerLike[] = [],
        inheritedParams: Map<string, ParamHandler[]> = new Map(),
        depth: number = 0,
    ): CompiledEndpoint[] {
        if (depth > this.maxNestingDepth) {
            throw new Error(`Router nesting depth exceeded (max: ${this.maxNestingDepth})`);
        }

        const endpoints: CompiledEndpoint[] = [];

        const localParams = new Map(inheritedParams);
        for (const [name, handlers] of this.paramHandlers.entries()) {
            const previous = localParams.get(name) ?? [];
            localParams.set(name, [...previous, ...handlers]);
        }

        const localMiddlewareStack = [...inheritedMiddlewares];

        for (const layer of this.layers) {
            const fullPath = joinPath(basePath, layer.path);

            if (layer.kind === "middleware") {
                localMiddlewareStack.push(...layer.handlers);
                continue;
            }

            if (layer.kind === "router") {
                const childEndpoints = layer.router.compileEndpoints(
                    fullPath,
                    [...localMiddlewareStack],
                    localParams,
                    depth + 1,
                );
                endpoints.push(...childEndpoints);
                continue;
            }

            const routeParamNames = layer.path
                .split("/")
                .filter(Boolean)
                .filter(value => value.startsWith(":"))
                .map(value => value.slice(1));

            const paramMiddleware: RouteHandler[] = routeParamNames.length === 0
                ? []
                : [async (req, res, next) => {
                    const selected: Record<string, string> = {};
                    for (const key of routeParamNames) {
                        if (req.params[key] !== undefined) {
                            selected[key] = req.params[key];
                        }
                    }

                    const cache = (req as IRequest & { _paramCache?: ParamCache })._paramCache;
                    const snapshot = cache ? { ...cache } : undefined;

                    try {
                        await this.runParamCallbacks(req, res, selected);
                    } finally {
                        (req as IRequest & { _paramCache?: ParamCache })._paramCache = snapshot;
                    }

                    return next();
                }];

            for (const stackItem of layer.route.getStack()) {
                const methodsToCompile = stackItem.methods.has("ALL")
                    ? METHODS
                    : [...stackItem.methods].filter((value): value is Method => value !== "ALL");

                for (const method of methodsToCompile) {
                    endpoints.push({
                        path: fullPath,
                        method,
                        handlers: [
                            ...localMiddlewareStack,
                            ...paramMiddleware,
                            ...stackItem.handlers,
                        ],
                    });
                }
            }
        }

        return endpoints;
    }

    toBunRoutes() {
        const routes: Record<string, Partial<Record<Method, (req: BunRequest) => Response | Promise<Response>>>> = {};

        const endpoints = this.compileEndpoints("/");

        for (const endpoint of endpoints) {
            routes[endpoint.path] ??= {};

            routes[endpoint.path]![endpoint.method] = (request: BunRequest) => {
                const { req, res } = createContext(request, this.routerOptions?.request);
                return compose(endpoint.handlers)(req, res)
                    .then(response => response ?? new Response(""));
            };
        }

        for (const { prefix, bundle } of this.htmlBundles) {
            routes[prefix] = bundle as unknown as Partial<Record<Method, (req: BunRequest) => Response | Promise<Response>>>;
        }

        return routes satisfies BunRoutes;
    }

    printRoutes() {
        const lines = this.compileEndpoints("/").map(endpoint => `${endpoint.method.padEnd(8)} ${endpoint.path}`);
        return lines.sort().join("\n");
    }

    getRoutes(): RouteInfo[] {
        return this.compileEndpoints("/").map(endpoint => {
            const middlewareNames = endpoint.handlers
                .slice(0, Math.max(0, endpoint.handlers.length - 1))
                .filter(isRouteHandler)
                .map(handler => handler.name || "<anonymous>");

            return {
                method: endpoint.method,
                path: endpoint.path,
                middlewares: middlewareNames,
            };
        });
    }

    getCompiledRoutes() {
        return this.compileEndpoints("/").map(endpoint => ({
            method: endpoint.method,
            path: endpoint.path,
            handlers: endpoint.handlers,
        }));
    }
}

export { methods };

export default Router;
