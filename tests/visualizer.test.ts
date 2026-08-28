import { describe, expect, it } from "bun:test";
import Router, { RouteViewerMiddleware } from "../lib/index";
import { createContext } from "../lib/context";
import { compose } from "../lib/compose";

function createMockBunRequest(url: string, method: string = "GET") {
    return {
        url,
        method,
        params: {},
        cookies: new Bun.CookieMap(""),
    } as any;
}

describe("RouteViewerMiddleware", () => {
    it("should serve HTML UI at the default path /_routes", async () => {
        const router = new Router();
        router.get("/users", (req, res) => res.json({ ok: true }));
        router.post("/users", (req, res) => res.json({ created: true }));

        router.use(RouteViewerMiddleware(router));

        const req = createMockBunRequest("http://localhost:3000/_routes");
        const { req: ctxReq, res: ctxRes } = createContext(req);

        const endpoints = router.getCompiledRoutes();
        const viewerEndpoint = endpoints.find(e => e.path === "/_routes" && e.method === "GET");
        expect(viewerEndpoint).toBeDefined();

        const response = await compose(viewerEndpoint!.handlers)(ctxReq, ctxRes);
        expect(response).toBeDefined();
        expect(response!.status).toBe(200);
        expect(response!.headers.get("Content-Type")).toContain("text/html");

        const text = await response!.text();
        expect(text).toContain("<!DOCTYPE html>");
        expect(text).toContain("Routerun Explorer");
        expect(text).toContain("/users");
    });

    it("should support custom mount path and title", async () => {
        const router = new Router();
        router.get("/api/v1/items/:id", (req, res) => res.json({ id: req.params.id }));

        router.use(RouteViewerMiddleware(router, {
            path: "/admin/routes",
            title: "Custom API Inspector",
        }));

        const req = createMockBunRequest("http://localhost:3000/admin/routes");
        const { req: ctxReq, res: ctxRes } = createContext(req);

        const endpoints = router.getCompiledRoutes();
        const viewerEndpoint = endpoints.find(e => e.path === "/admin/routes" && e.method === "GET");
        expect(viewerEndpoint).toBeDefined();

        const response = await compose(viewerEndpoint!.handlers)(ctxReq, ctxRes);
        expect(response!.status).toBe(200);

        const text = await response!.text();
        expect(text).toContain("Custom API Inspector");
        expect(text).toContain("/api/v1/items/:id");
    });

    it("should return JSON list at /json endpoint and ?format=json", async () => {
        const router = new Router();
        router.get("/health", (req, res) => res.text("ok"));
        router.delete("/resource/:id", (req, res) => res.text("deleted"));

        router.use(RouteViewerMiddleware(router, { path: "/_routes" }));

        // Test /_routes/json
        const jsonReq = createMockBunRequest("http://localhost:3000/_routes/json");
        const { req: ctxReq1, res: ctxRes1 } = createContext(jsonReq);
        const jsonEndpoint = router.getCompiledRoutes().find(e => e.path === "/_routes/json" && e.method === "GET");
        const jsonRes = await compose(jsonEndpoint!.handlers)(ctxReq1, ctxRes1);

        const data = await jsonRes!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.some((r: any) => r.path === "/health" && r.method === "GET")).toBe(true);
        expect(data.some((r: any) => r.path === "/resource/:id" && r.method === "DELETE")).toBe(true);

        // Test /_routes?format=json
        const queryReq = createMockBunRequest("http://localhost:3000/_routes?format=json");
        const { req: ctxReq2, res: ctxRes2 } = createContext(queryReq);
        const routesEndpoint = router.getCompiledRoutes().find(e => e.path === "/_routes" && e.method === "GET");
        const queryRes = await compose(routesEndpoint!.handlers)(ctxReq2, ctxRes2);

        const queryData = await queryRes!.json();
        expect(Array.isArray(queryData)).toBe(true);
        expect(queryData.some((r: any) => r.path === "/health")).toBe(true);
    });

    it("should honor enabled: false", async () => {
        const router = new Router();
        let nextCalled = false;

        const mw = RouteViewerMiddleware(router, {
            path: "/_routes",
            enabled: false,
        });

        const req = createMockBunRequest("http://localhost:3000/_routes");
        const { req: ctxReq, res: ctxRes } = createContext(req);

        await mw(ctxReq, ctxRes, () => {
            nextCalled = true;
        });

        expect(nextCalled).toBe(true);
    });

    it("should work seamlessly via toBunRoutes() and handle()", async () => {
        const router = new Router();
        router.get("/hello", (req, res) => res.text("world"));
        router.use(RouteViewerMiddleware(router, { path: "/debug" }));

        const bunRoutes = router.toBunRoutes();
        expect(bunRoutes["/debug"]).toBeDefined();
        expect(bunRoutes["/debug/json"]).toBeDefined();

        const req = createMockBunRequest("http://localhost:3000/debug");
        const res = await (bunRoutes["/debug"] as any).GET(req);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("/hello");

        // Validate client script syntax in the HTML
        const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
        expect(scriptMatch).not.toBeNull();

        // Validate script and formatPath logic inside script
        const mockDoc = {
            getElementById: () => ({ addEventListener: () => {}, textContent: "", innerHTML: "" }),
            querySelectorAll: () => [],
        };
        const formatPathFn = new Function("document", `
            ${scriptMatch![1]}
            return formatPath;
        `)(mockDoc);

        expect(formatPathFn("/users/:id")).toBe('/users/<span class="path-param">:id</span>');
        expect(formatPathFn("/files/*")).toBe('/files/<span class="path-wildcard">*</span>');
        expect(formatPathFn("/api/*path")).toBe('/api/<span class="path-wildcard">*path</span>');
        expect(formatPathFn("/posts/:postId/comments/:commentId")).toBe(
            '/posts/<span class="path-param">:postId</span>/comments/<span class="path-param">:commentId</span>'
        );
    });
});


