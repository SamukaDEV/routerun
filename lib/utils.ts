import type { ErrorRouteHandler, HandlerLike, IResponse, IRequest, Method, RouteHandler } from "./types";

export const METHODS: Method[] = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "HEAD",
];

export const methods = METHODS.map(method => method.toLowerCase());

export function isRouteHandler(value: unknown): value is RouteHandler {
    return typeof value === "function" && value.length < 4;
}

export function isErrorHandler(value: unknown): value is ErrorRouteHandler {
    return typeof value === "function" && value.length >= 4;
}

export function flattenHandlers(values: unknown[]): HandlerLike[] {
    const queue = [...values];
    const handlers: HandlerLike[] = [];

    while (queue.length > 0) {
        const item = queue.shift();

        if (Array.isArray(item)) {
            queue.unshift(...item);
            continue;
        }

        if (typeof item !== "function") {
            throw new TypeError("argument handler must be a function");
        }

        handlers.push(item as HandlerLike);
    }

    if (handlers.length === 0) {
        throw new TypeError("argument handler is required");
    }

    return handlers;
}

export function parseUrl(input: string | undefined): {
    url: string;
    pathname: string;
    search: string;
    fqdnPrefix: string;
} {
    if (!input) {
        return {
            url: "/",
            pathname: "/",
            search: "",
            fqdnPrefix: "",
        };
    }

    const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);

    if (!hasProtocol) {
        const [pathnameRaw, searchRaw = ""] = input.split("?");
        return {
            url: input,
            pathname: pathnameRaw || "/",
            search: searchRaw ? `?${searchRaw}` : "",
            fqdnPrefix: "",
        };
    }

    try {
        const parsed = new URL(input);
        return {
            url: input,
            pathname: parsed.pathname || "/",
            search: parsed.search || "",
            fqdnPrefix: `${parsed.protocol}//${parsed.host}`,
        };
    } catch {
        return {
            url: input,
            pathname: "/",
            search: "",
            fqdnPrefix: "",
        };
    }
}

export function sanitizeParams(params: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
        // validate keys
        if (!/^[\w\-]+$/.test(key)) {
            throw new Error(`Invalid param key: ${key}`);
        }

        // clear values with danger characters
        sanitized[key] = value.replace(/[<>'"]/g, '');
    }

    return sanitized;
}

export function createEndResponse(data?: string | Buffer | Error, encoding?: string, callback?: () => Response): Response {
    if (typeof callback === "function") {
        const callbackResponse = callback();
        if (callbackResponse instanceof Response) {
            return callbackResponse;
        }
    }

    const body = data === undefined ? "" : data;
    return new Response(body as BodyInit);
}

export function createTrackedResponse(res: IResponse): IResponse & { __response?: Response } {
    const state: { current?: Response } = {};

    return {
        get locals() {
            return res.locals;
        },
        set locals(value) {
            res.locals = value;
        },
        json(data, init) {
            const response = res.json(data, init);
            state.current = response;
            return response;
        },
        text(data, init) {
            const response = res.text(data, init);
            state.current = response;
            return response;
        },
        end(data, encoding, callback) {
            const payload = res.end(data, encoding, callback);

            if (payload instanceof Response) {
                state.current = payload;
                return payload;
            }

            const fallback = createEndResponse(data, encoding, callback);
            state.current = fallback;
            return fallback;
        },
        get __response() {
            return state.current;
        },
    } as IResponse & { __response?: Response };
}

export function isValidPath(path: string): boolean {
    // Reject path traversal
    if (path.includes('..') || path.includes('//')) {
        return false;
    }

    // Only alphanumerics, -, _, /, :
    return /^\/[\w\-\/.:\*]*$/.test(path);
}

export function joinPath(...parts: string[]): string {
    const result = "/" + parts
        .map(p => p.replace(/^\/|\/$/g, ""))
        .filter(Boolean)
        .join("/");

    if (!isValidPath(result)) {
        throw new Error(`Invalid path: ${result}`);
    }

    return result;
}

type MatchResult = {
    matched: boolean;
    params: Record<string, string>;
    pathRemainder: string;
    consumedPath: string;
};

export function matchRoute(
    pattern: string,
    pathname: string,
    end: boolean = true,
): MatchResult {

    if (pattern === pathname) {
        return {
            matched: true,
            params: {},
            pathRemainder: "/",
            consumedPath: pathname,
        };
    }

    if (pattern === "/") {
        return {
            matched: true,
            params: {},
            pathRemainder: pathname || "/",
            consumedPath: "",
        };
    }

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (end && patternParts.length !== pathParts.length) {
        return {
            matched: false,
            params: {},
            pathRemainder: "/",
            consumedPath: "",
        };
    }

    if (!end && patternParts.length > pathParts.length) {
        return {
            matched: false,
            params: {},
            pathRemainder: "/",
            consumedPath: "",
        };
    }

    const params: Record<string, string> = {};
    let consumedCount = 0;

    for (let i = 0; i < patternParts.length; i++) {

        const expected: string = patternParts[i]!;
        const received = pathParts[i];

        if (!received) {
            return {
                matched: false,
                params: {},
                pathRemainder: "/",
                consumedPath: "",
            };
        }

        if (expected === "*") {
            consumedCount += 1;
            continue;
        }

        if (expected.startsWith(":")) {

            params[expected.slice(1)] =
                decodeURIComponent(received);

            consumedCount += 1;

            continue;
        }

        if (expected !== received) {
            return {
                matched: false,
                params: {},
                pathRemainder: "/",
                consumedPath: "",
            };
        }

        consumedCount += 1;
    }

    if (end === false && pathParts.length === patternParts.length && pathname !== "/") {
        const lastChar = pathname.endsWith("/") ? "/" : "";
        return {
            matched: true,
            params,
            pathRemainder: "/",
            consumedPath: `/${pathParts.slice(0, consumedCount).join("/")}${lastChar}`,
        };
    }

    const remainderParts = pathParts.slice(consumedCount);
    const consumedPath = consumedCount > 0 ? `/${pathParts.slice(0, consumedCount).join("/")}` : "";
    const pathRemainder = remainderParts.length > 0 ? `/${remainderParts.join("/")}` : "/";

    if (end && remainderParts.length > 0) {
        return {
            matched: false,
            params: {},
            pathRemainder: "/",
            consumedPath: "",
        };
    }

    return {
        matched: true,
        params,
        pathRemainder,
        consumedPath,
    };
}

export function getRequestMethod(req: unknown): string {
    const request = req as { method?: unknown };

    if (typeof request?.method !== "string") {
        return "GET";
    }

    return request.method.toUpperCase();
}

export function getRequestUrl(req: unknown): string {
    const request = req as { url?: unknown; originalUrl?: unknown };

    if (typeof request?.url === "string" && request.url.length > 0) {
        return request.url;
    }

    if (typeof request?.originalUrl === "string" && request.originalUrl.length > 0) {
        return request.originalUrl;
    }

    return "/";
}

export function applyReqSnapshot(req: IRequest, snapshot: Partial<IRequest>): void {
    for (const [key, value] of Object.entries(snapshot)) {
        (req as Record<string, any>)[key] = value;
    }
}

export function createReqSnapshot(req: IRequest): Partial<IRequest> {
    return {
        url: req.url,
        baseUrl: req.baseUrl,
        params: { ...req.params },
    };
}