import type { IRequest, IResponse, NextFunction, RouteHandler, LoggerMiddlewareOptions } from "./types";

export const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    gray: "\x1b[90m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    purple: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    orange: "\x1b[38;5;208m",
} as const;

export const METHOD_COLORS: Record<string, string> = {
    GET: ANSI.green,
    POST: ANSI.yellow,
    DELETE: ANSI.red,
    PATCH: ANSI.orange,
    PUT: ANSI.purple,
    OPTIONS: ANSI.cyan,
    HEAD: ANSI.gray,
};

export const PATH_COLOR = ANSI.yellow;
export const PARAM_COLOR = ANSI.blue;

export function colorizeMethod(method: string, colors = true): string {
    if (!colors) return method;
    const color = METHOD_COLORS[method.toUpperCase()] ?? ANSI.white;
    return `${color}${method}${ANSI.reset}`;
}

export function colorizePath(path: string, colors = true): string {
    if (!colors) return path;
    const colored = path.replace(
        /(:[a-zA-Z0-9_]+|\*[\w]*)/g,
        match => `${PARAM_COLOR}${match}${PATH_COLOR}`
    );
    return `${PATH_COLOR}${colored}${ANSI.reset}`;
}

export function colorizeStatus(status: number, colors = true): string {
    if (!colors) return String(status);
    let color: string = ANSI.green;
    if (status >= 500) {
        color = ANSI.red;
    } else if (status >= 400) {
        color = ANSI.yellow;
    } else if (status >= 300) {
        color = ANSI.cyan;
    }
    return `${color}${status}${ANSI.reset}`;
}

export function formatRouteLine(method: string, path: string, options?: { colors?: boolean }): string {
    const useColors = options?.colors ?? false;
    if (useColors) {
        const coloredMethod = colorizeMethod(method, true);
        const spacing = " ".repeat(Math.max(1, 8 - method.length + 1));
        const coloredPath = colorizePath(path, true);
        return `[${coloredMethod}]${spacing}${coloredPath}`;
    }
    return `[${method.padEnd(8)}] ${path}`;
}

export function LoggerMiddleware(options?: LoggerMiddlewareOptions): RouteHandler {
    const showTimestamp = options?.timestamp ?? false;
    const useColors = options?.colors ?? true;
    const output = options?.output ?? console.log;

    return async function logger(req: IRequest, res: IResponse, next: NextFunction) {
        const start = performance.now();
        await next();
        const duration = (performance.now() - start).toFixed(2);

        const method = req.method ? req.method.toUpperCase() : "GET";
        const url = req.originalUrl ?? req.url ?? "/";
        const status = res.__response?.status ?? 200;

        const parts: string[] = [];

        if (showTimestamp) {
            const timeStr = new Date().toLocaleTimeString();
            parts.push(useColors ? `${ANSI.gray}[${timeStr}]${ANSI.reset}` : `[${timeStr}]`);
        }

        const methodFormatted = useColors ? `[${colorizeMethod(method, true)}]` : `[${method}]`;
        parts.push(methodFormatted);

        const pathFormatted = colorizePath(url, useColors);
        parts.push(pathFormatted);

        const statusFormatted = useColors ? `[${colorizeStatus(status, true)}]` : `[${status}]`;
        parts.push(statusFormatted);

        const durationFormatted = useColors ? `${ANSI.gray}+${duration}ms${ANSI.reset}` : `+${duration}ms`;
        parts.push(durationFormatted);

        output(parts.join(" "));
    };
}

export const loggerMiddleware = LoggerMiddleware;
