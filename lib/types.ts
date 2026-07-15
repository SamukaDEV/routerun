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

export interface IRequest {
    raw: Request;
    method?: string;
    url?: string;
    originalUrl?: string;
    baseUrl?: string;
    params: Record<string, string>;
    state: IState;
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

export type RouteHandler<Req extends IRequest = IRequest, Res extends IResponse = IResponse> = (
    req: Req,
    res: Res,
    next: NextFunction,
) => Response | void | Promise<Response | void>;

export type ErrorRouteHandler<Req extends IRequest = IRequest, Res extends IResponse = IResponse> = (
    err: unknown,
    req: Req,
    res: Res,
    next: NextFunction,
) => Response | void | Promise<Response | void>;

export type HandlerLike = RouteHandler | ErrorRouteHandler;

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
