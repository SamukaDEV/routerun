import type { IRequest, IResponse, NextFunction, RouteHandler, LoggerMiddlewareOptions } from "./types";
import { getDefaultLogStore, type RequestLogEntry } from "./log-store";
import { parseUrl } from "./utils";

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

const DEFAULT_SENSITIVE_HEADERS = ["authorization", "proxy-authorization"];
const DEFAULT_IGNORED_PATHS = [/\/logs\/stream$/, /\/logs\/clear$/];

export function LoggerMiddleware(options?: LoggerMiddlewareOptions): RouteHandler {
    const showTimestamp = options?.timestamp ?? false;
    const useColors = options?.colors ?? true;
    const output = options?.output ?? console.log;
    const captureBody = options?.captureBody ?? true;
    const maxBodySize = options?.maxBodySize ?? 65536;
    const sensitiveHeaders = options?.sanitizeHeaders ?? DEFAULT_SENSITIVE_HEADERS;
    const ignorePaths = options?.ignorePaths ?? DEFAULT_IGNORED_PATHS;

    // Resolve store: user store, default store, or null if explicitly false
    const store = options?.store === false ? null : (options?.store ?? getDefaultLogStore());

    return async function __internal__LoggerMiddleware(req: IRequest, res: IResponse, next: NextFunction) {
        if (typeof options?.enabled === "boolean" && !options.enabled) {
            return next();
        }
        if (typeof options?.enabled === "function" && !options.enabled(req)) {
            return next();
        }

        const rawUrl = req.originalUrl ?? req.url ?? "/";
        const parsed = parseUrl(rawUrl);
        const pathname = parsed.pathname;
        const search = parsed.search;

        // Check if path is ignored
        for (const pattern of ignorePaths) {
            if (typeof pattern === "string" && (pathname === pattern || rawUrl === pattern)) {
                return next();
            } else if (pattern instanceof RegExp && (pattern.test(pathname) || pattern.test(rawUrl))) {
                return next();
            }
        }

        const method = req.method ? req.method.toUpperCase() : "GET";

        // Capture headers safely
        const headers: Record<string, string> = {};
        if (req.raw?.headers) {
            req.raw.headers.forEach((value, key) => {
                const lower = key.toLowerCase();
                if (sensitiveHeaders.includes(lower)) {
                    headers[key] = "********";
                } else {
                    headers[key] = value;
                }
            });
        }

        // Capture query parameters
        const query: Record<string, string> = {};
        if (search) {
            const sp = new URLSearchParams(search);
            sp.forEach((value, key) => {
                query[key] = value;
            });
        }

        // Pre-clone and read body if applicable
        let capturedBody: any = undefined;
        let capturedBodyRaw: string | undefined = undefined;
        const canHaveBody = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

        if (captureBody && canHaveBody && req.raw) {
            try {
                const clone = req.raw.clone();
                const text = await clone.text();
                if (text && text.length <= maxBodySize) {
                    capturedBodyRaw = text;
                    const cType = headers["content-type"] || headers["Content-Type"] || "";
                    if (cType.includes("application/json")) {
                        try {
                            capturedBody = JSON.parse(text);
                        } catch {
                            capturedBody = text;
                        }
                    } else {
                        capturedBody = text;
                    }
                } else if (text && text.length > maxBodySize) {
                    capturedBodyRaw = text.slice(0, maxBodySize) + "... [truncated]";
                    capturedBody = capturedBodyRaw;
                }
            } catch {
                // If clone fails (e.g. stream already closed), silently proceed
            }
        }

        const start = performance.now();
        await next();
        const durationDiff = performance.now() - start;
        const duration = durationDiff.toFixed(2);
        const durationMs = Number(durationDiff.toFixed(2));

        const resObj = res.__response;
        const status = resObj?.status ?? 200;

        // Capture response headers and response body
        const responseHeaders: Record<string, string> = {};
        let responseBody: any = undefined;
        let responseBodyRaw: string | undefined = undefined;
        let responseContentType: string | undefined = undefined;

        if (resObj) {
            if (resObj.headers) {
                resObj.headers.forEach((val, key) => {
                    responseHeaders[key] = val;
                });
                responseContentType = resObj.headers.get("content-type") || undefined;
            }

            try {
                const resClone = resObj.clone();
                const resText = await resClone.text();
                if (resText) {
                    if (resText.length <= maxBodySize) {
                        responseBodyRaw = resText;
                        try {
                            responseBody = JSON.parse(resText);
                        } catch {
                            responseBody = resText;
                        }
                    } else {
                        responseBodyRaw = resText.slice(0, maxBodySize) + "... [truncated]";
                        responseBody = responseBodyRaw;
                    }
                }
            } catch {
                // If clone fails, proceed safely
            }
        }

        // Dispatch to RequestLogStore
        if (store) {
            const entry: RequestLogEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                timestamp: new Date().toISOString(),
                timeStr: new Date().toLocaleTimeString(),
                method,
                url: rawUrl,
                pathname,
                search,
                status,
                duration: `+${duration}ms`,
                durationMs,
                ip: headers["x-forwarded-for"] || headers["x-real-ip"] || undefined,
                headers,
                params: { ...(req.params || {}) },
                query,
                body: capturedBody,
                bodyRaw: capturedBodyRaw,
                contentType: headers["content-type"] || headers["Content-Type"],
                responseHeaders,
                responseBody,
                responseBodyRaw,
                responseContentType,
            };
            store.add(entry);
        }

        const parts: string[] = [];

        if (showTimestamp) {
            const timeStr = new Date().toLocaleTimeString();
            parts.push(useColors ? `${ANSI.gray}[${timeStr}]${ANSI.reset}` : `[${timeStr}]`);
        }

        const methodFormatted = useColors ? `[${colorizeMethod(method, true)}]` : `[${method}]`;
        parts.push(methodFormatted);

        const pathFormatted = colorizePath(rawUrl, useColors);
        parts.push(pathFormatted);

        const statusFormatted = useColors ? `[${colorizeStatus(status, true)}]` : `[${status}]`;
        parts.push(statusFormatted);

        const durationFormatted = useColors ? `${ANSI.gray}+${duration}ms${ANSI.reset}` : `+${duration}ms`;
        parts.push(durationFormatted);

        output(parts.join(" "));
    };
}

export const loggerMiddleware = LoggerMiddleware;
