import type { IRequest, IResponse, NextFunction, RouteHandler, RouteInfo, RouteViewerOptions } from "./types";
import { getDefaultLogStore, type RequestLogStore } from "./log-store";
import { parseUrl } from "./utils";
import visualizer_html from "../resources/visualizer.html";

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-braces-icon lucide-braces"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>`;

export async function generateRouteViewerHtml(
    routes: RouteInfo[],
    options?: RouteViewerOptions,
    store?: RequestLogStore | null
): Promise<string> {
    const title = options?.title ?? "Routerun Explorer";
    const basePath = options?.path ?? "/_routes";
    const routesJson = JSON.stringify(routes).replace(/</g, "\\u003c");
    const liveLogsEnabled = options?.liveLogs !== false;
    const initialLogsJson = (liveLogsEnabled && store)
        ? JSON.stringify(store.getLogs({ limit: 50, order: "asc" })).replace(/</g, "\\u003c")
        : "[]";

    // Method counts for stats
    const methodCounts: Record<string, number> = {};
    const uniquePaths = new Set<string>();
    let totalMiddlewares = 0;

    for (const route of routes) {
        methodCounts[route.method] = (methodCounts[route.method] || 0) + 1;
        uniquePaths.add(route.path);
        totalMiddlewares += route.middlewares?.length || 0;
    }

    const file = Bun.file(visualizer_html.index);
    const html_content = await file.text();

    return html_content
        .replace(/__VAR_BASEPATH__/gi, basePath)
        .replace(/__VAR_FAVICON__/gi, Buffer.from(FAVICON_SVG).toBase64())
        .replace(/__VAR_TITLE__/gi, escapeHtml(title))
        .replace(/__VAR_ROUTES_LENGTH__/gi, String(routes.length))
        .replace(/__VAR_UNIQUE_PATHS_SIZE__/gi, String(uniquePaths.size))
        .replace(/__VAR_TOTAL_MIDDLEWARES__/gi, String(totalMiddlewares))
        .replace(/__VAR_LIVE_LOGS_ENABLED__/gi, liveLogsEnabled ? "true" : "false")
        .replace(/__VAR_BADGES__/gi, String(Object.entries(methodCounts).map(([method, count]) => {
            return `<button class="filter-pill" data-method="${method}">
                        ${method} <span class="pill-badge">${count}</span>
                    </button>`;
        }).join('')))
        .replace(/__VAR_RAW_JSON__/gi, String(options?.jsonEndpoint !== false ? 'inline-flex' : 'hidden'))
        .replace(/\/\* __VAR_CUSTOM_CSS__ \*\//gi, String(options?.customCss ?? ''))
        .replace(/\<\!-- __VAR_CUSTOM_HEADER__ --\>/gi, String(options?.customHead ?? ''))
        .replace(/\[\]\; \/\/ __VAR_JSON_ROUTES__\;/gi, routesJson)
        .replace(/\[\]\; \/\/ __VAR_JSON_LOGS__\;/gi, initialLogsJson);
}

function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export interface RouterInstanceWithRoutes {
    getRoutes(): RouteInfo[];
    get?(path: string, ...handlers: any[]): any;
    post?(path: string, ...handlers: any[]): any;
}

/**
 * Creates a Route Viewer middleware that serves a rich interactive UI
 * to inspect all registered routes, HTTP methods, path params, middlewares,
 * and live request logs in real-time.
 *
 * Usage:
 * ```ts
 * import Router, { RouteViewerMiddleware, LoggerMiddleware } from "routerun";
 *
 * const app = new Router();
 * app.use(LoggerMiddleware());
 * app.use(RouteViewerMiddleware(app, { path: "/_debug/routes" }));
 * ```
 */
export function RouteViewerMiddleware(
    router: RouterInstanceWithRoutes,
    options?: RouteViewerOptions
): RouteHandler {
    const basePath = options?.path ?? "/_routes";
    const normalizedBasePath = basePath.endsWith("/") && basePath.length > 1 ? basePath.slice(0, -1) : basePath;
    const jsonPath = `${normalizedBasePath}/json`;
    const logsPath = `${normalizedBasePath}/logs`;
    const streamPath = `${normalizedBasePath}/logs/stream`;
    const clearPath = `${normalizedBasePath}/logs/clear`;

    const liveLogs = options?.liveLogs !== false;
    const store = options?.store === false ? null : (options?.store ?? getDefaultLogStore());

    const __internal__RouteViewerMiddleware: RouteHandler = async (req: IRequest, res: IResponse, next: NextFunction): Promise<any> => {
        // Check if disabled
        if (typeof options?.enabled === "boolean" && !options.enabled) {
            return next();
        }
        if (typeof options?.enabled === "function" && !options.enabled(req)) {
            return next();
        }

        const rawUrl = req.url || req.originalUrl || "/";
        const pathname = parseUrl(rawUrl).pathname;
        const method = (req.method || "GET").toUpperCase();

        // 1. Match UI path
        if (method === "GET" && (pathname === normalizedBasePath || pathname === `${normalizedBasePath}/`)) {
            let routes = router.getRoutes();
            if (options?.includeInternal !== true) {
                routes = routes.filter(r => !r.path.startsWith(normalizedBasePath));
            }

            // Check if format=json query was requested
            const urlObj = parseUrl(rawUrl);
            if (urlObj.search.includes("format=json")) {
                return res.json(routes);
            }

            const html = await generateRouteViewerHtml(routes, { ...options, path: normalizedBasePath }, store);
            return res.send(html, {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
        }

        // 2. Match JSON routes endpoint
        if (method === "GET" && options?.jsonEndpoint !== false && pathname === jsonPath) {
            let routes = router.getRoutes();
            if (options?.includeInternal !== true) {
                routes = routes.filter(r => !r.path.startsWith(normalizedBasePath));
            }
            return res.json(routes, {
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
        }

        // 3. Match Live SSE Stream endpoint
        if (method === "GET" && liveLogs && pathname === streamPath) {
            let unsubscribe: (() => void) | null = null;
            let heartbeatInterval: any = null;

            const stream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();

                    // Immediately flush SSE connection comment so headers are sent
                    controller.enqueue(encoder.encode(": connected\n\n"));

                    // Send recent logs initial burst if any
                    if (store) {
                        const recentLogs = store.getLogs({ limit: 50, order: "asc" });
                        for (const log of recentLogs) {
                            controller.enqueue(encoder.encode(`event: log\ndata: ${JSON.stringify(log)}\n\n`));
                        }

                        // Subscribe to live incoming requests
                        unsubscribe = store.subscribe((log) => {
                            try {
                                controller.enqueue(encoder.encode(`event: log\ndata: ${JSON.stringify(log)}\n\n`));
                            } catch {
                                // Stream consumer detached
                            }
                        });
                    }

                    // Keep-alive heartbeat ping every 15s
                    heartbeatInterval = setInterval(() => {
                        try {
                            controller.enqueue(encoder.encode(`: ping\n\n`));
                        } catch {
                            clearInterval(heartbeatInterval);
                        }
                    }, 15000);
                },
                cancel() {
                    if (unsubscribe) unsubscribe();
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                }
            });

            return new Response(stream, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "Connection": "keep-alive",
                }
            });
        }

        // 4. Match JSON logs snapshot endpoint
        if (method === "GET" && options?.logsEndpoint !== false && liveLogs && pathname === logsPath) {
            const urlObj = parseUrl(rawUrl);
            const sp = new URLSearchParams(urlObj.search);
            const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 100;
            const logs = store ? store.getLogs({ limit }) : [];
            return res.json({ logs }, {
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
        }

        // 5. Match Clear logs endpoint
        if (method === "POST" && liveLogs && pathname === clearPath) {
            if (store) {
                store.clear();
            }
            return res.json({ ok: true, message: "Logs cleared" });
        }

        return next();
    };

    // Explicitly register endpoints if router supports it for Bun.serve routes
    if (router && typeof router.get === "function") {
        router.get(normalizedBasePath, __internal__RouteViewerMiddleware);
        if (options?.jsonEndpoint !== false) {
            router.get(jsonPath, __internal__RouteViewerMiddleware);
        }
        if (liveLogs && options?.logsEndpoint !== false) {
            router.get(streamPath, __internal__RouteViewerMiddleware);
            router.get(logsPath, __internal__RouteViewerMiddleware);
            if (typeof router.post === "function") {
                router.post(clearPath, __internal__RouteViewerMiddleware);
            }
        }
    }

    return __internal__RouteViewerMiddleware;
}

export const routeViewerMiddleware = RouteViewerMiddleware;
export const RouteViewer = RouteViewerMiddleware;
export const createRouteViewer = RouteViewerMiddleware;
