import type { BunRequest, HTMLBundle } from "bun";

export type BunRoutes = NonNullable<Parameters<typeof Bun.serve>[0]["routes"]>;

export type BunRoute = {
    GET?: (req: BunRequest) => Response | Promise<Response>;
    POST?: (req: BunRequest) => Response | Promise<Response>;
    PUT?: (req: BunRequest) => Response | Promise<Response>;
    PATCH?: (req: BunRequest) => Response | Promise<Response>;
    DELETE?: (req: BunRequest) => Response | Promise<Response>;
    OPTIONS?: (req: BunRequest) => Response | Promise<Response>;
    HEAD?: (req: BunRequest) => Response | Promise<Response>;
};

export type Method = keyof BunRoute;

export type ILocals = Record<string, any>;
export type IState = Record<string, any>;

/**
 * Extracts route parameter names from a path string literal.
 * Example: "/aluno/:idaluno/turma/:idturma" -> "idaluno" | "idturma"
 */
export type ExtractParamKeys<Path extends string> =
    Path extends `${string}:${infer Param}/${infer Rest}`
        ? Param | ExtractParamKeys<`/${Rest}`>
        : Path extends `${string}:${infer Param}`
            ? Param
            : never;

/**
 * Maps extracted parameter names to a typed dictionary of strings.
 * If Path is a generic string (not a string literal) or contains no parameters, falls back to Record<string, string>.
 */
export type RouteParams<Path extends string> = string extends Path
    ? Record<string, string>
    : [ExtractParamKeys<Path>] extends [never]
        ? Record<string, string>
        : { [K in ExtractParamKeys<Path>]: string };

export interface IRequest<
    TParams extends Record<string, any> = Record<string, string>,
    TState extends IState = IState
> {
    raw: Request;
    method?: string;
    url?: string;
    originalUrl?: string;
    baseUrl?: string;
    params: TParams;
    state: TState;
    counter: number;
    hit: number;
    ms: number;
    cookies: BunRequest["cookies"];
}

export interface IResponse<TLocals extends ILocals = ILocals> {
    locals: TLocals;
    json(data: unknown, init?: ResponseInit): Response;
    text(data: string, init?: ResponseInit): Response;
    send(data: unknown, init?: ResponseInit): Response | unknown;
    end(data?: string | Buffer | undefined | Error, encoding?: string | undefined, callback?: () => Response): Response;
    __response?: Response;
}

export type NextFunction = (err?: unknown) => void | Promise<void>;

export type RouteHandler<
    TParams extends Record<string, any> = any,
    Res extends IResponse = IResponse,
    Req extends IRequest<TParams> = IRequest<TParams>
> = (
    req: Req,
    res: Res,
    next: NextFunction,
) => Response | void | Promise<Response | void>;

export type ErrorRouteHandler<
    TParams extends Record<string, any> = any,
    Res extends IResponse = IResponse,
    Req extends IRequest<TParams> = IRequest<TParams>
> = (
    err: unknown,
    req: Req,
    res: Res,
    next: NextFunction,
) => Response | void | Promise<Response | void>;

export type HandlerLike = RouteHandler<any> | ErrorRouteHandler<any>;

export type RouteHandlerList = RouteHandler[];
export type ErrorHandlerList = ErrorRouteHandler[];

export type RouteHandlerArgs = RouteHandler[];

export interface ContextOptions {
    cors?: boolean;
    allowedOrigins?: string[];
    securityHeaders?: boolean;
}

export interface RouterOptions {
    maxNestingDepth?: number;
    request?: ContextOptions;
}

export interface RouteInfo {
    method: Method;
    path: string;
    middlewares: string[];
}

export interface PrintRoutesOptions {
    colors?: boolean;
    sort?: boolean;
}

export interface LoggerMiddlewareOptions {
    /**
     * Enable/disable the logger, or provide a predicate function based on request.
     * Useful for disabling in production (e.g. `process.env.NODE_ENV !== "production"`).
     * @default true
     */
    enabled?: boolean | ((req: IRequest) => boolean);
    timestamp?: boolean;
    colors?: boolean;
    output?: (message: string) => void;
    /**
     * Custom RequestLogStore instance to record requests into.
     * If not specified, automatically connects to the default/shared log store.
     */
    store?: import("./log-store").RequestLogStore | false;
    /**
     * Whether to capture the request body (POST, PUT, PATCH, DELETE).
     * @default true
     */
    captureBody?: boolean;
    /**
     * Maximum body size in bytes to buffer and capture for logs.
     * @default 65536 (64 KB)
     */
    maxBodySize?: number;
    /**
     * Array of header names to redact/mask in captured logs.
     * @default ["authorization", "proxy-authorization"]
     */
    sanitizeHeaders?: string[];
    /**
     * Paths or patterns to ignore from logging and store collection (e.g. streaming endpoints).
     */
    ignorePaths?: (string | RegExp)[];
}

export interface RouteViewerOptions {
    /**
     * The path at which the Route Viewer UI will be available.
     * @default "/_routes"
     */
    path?: string;
    /**
     * Dashboard title displayed in the browser tab and header.
     * @default "Routerun Explorer"
     */
    title?: string;
    /**
     * Enable/disable the viewer, or provide a predicate function based on request.
     * Useful for disabling in production (e.g. `process.env.NODE_ENV !== "production"`).
     * @default true
     */
    enabled?: boolean | ((req: IRequest) => boolean);
    /**
     * Whether to show internal viewer routes in the listed routes.
     * @default false
     */
    includeInternal?: boolean;
    /**
     * Whether to expose the JSON API endpoint at `${path}/json`.
     * @default true
     */
    jsonEndpoint?: boolean;
    /**
     * Whether to show summary metrics/stats cards on top.
     * @default true
     */
    showStats?: boolean;
    /**
     * Custom CSS rules to inject into the HTML page.
     */
    customCss?: string;
    /**
     * Custom HTML tags to inject into `<head>`.
     */
    customHead?: string;
    /**
     * Custom RequestLogStore instance to read live logs from.
     * If not specified, automatically connects to the default/shared log store.
     */
    store?: import("./log-store").RequestLogStore | false;
    /**
     * Whether to enable the live request logs tab and SSE streaming.
     * @default true
     */
    liveLogs?: boolean;
    /**
     * Whether to expose the JSON logs endpoint at `${path}/logs`.
     * @default true
     */
    logsEndpoint?: boolean;
}

export interface CompiledRoute {
    method: Method;
    path: string;
    handlers: HandlerLike[];
}

export interface ParamHandler {
    (req: IRequest, res: IResponse, next: NextFunction, value: string, name: string): void | Promise<void>;
}

export interface StaticBundle {
    prefix: string;
    bundle: HTMLBundle;
}

export interface MountedRouter {
    prefix: string;
    router: RouterLike;
}

export interface RouterLike {
    handle(req: unknown, res: unknown, callback: (err?: unknown) => void): void;
}

export type Middleware = RouteHandler;

export type { RequestLogEntry, RequestLogStoreOptions, LogListener } from "./log-store";
export type { RequestLogStore } from "./log-store";
