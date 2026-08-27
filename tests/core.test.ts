import { describe, expect, test } from "bun:test";
import Router, { LoggerMiddleware, type Middleware, type RouteHandler } from "../lib";

describe("Router", () => {

    const auth: Middleware = async (req, res, next) => next();

    test("register GET route", () => {
        const app = new Router();

        app.get("/users", (req, res) => res.text("ok"));

        expect(app.getRoutes()).toEqual([
            {
                method: "GET",
                path: "/users",
                middlewares: [],
            },
        ]);
    });

    test("nested router", () => {
        const api = new Router();

        api.get('/', (req, res) => res.json({}));
        api.get("/users", (req, res) => res.text("ok"));

        const app = new Router();

        app.use("/api", api);

        expect(app.getRoutes()).toEqual([
            {
                method: 'GET',
                path: '/api',
                middlewares: [],
            },
            {
                method: "GET",
                path: "/api/users",
                middlewares: [],
            },
        ]);
    });

    test("global middleware", () => {
        const app = new Router();


        app.use(auth);

        app.get("/users", (req, res) => res.text("ok"));

        expect(app.getRoutes()).toEqual([
            {
                method: "GET",
                path: "/users",
                middlewares: ["auth"],
            },
        ]);
    });

    test("prefix middleware", () => {
        const app = new Router();

        app.use("/api", auth);

        app.get("/api/users", (req, res) => res.text("ok"));

        expect(app.getRoutes()).toEqual([
            {
                method: "GET",
                path: "/api/users",
                middlewares: ["auth"],
            },
        ]);
    });

    test("route middleware", () => {
        const app = new Router();

        app.get(
            "/users",
            auth, // auth
            (req, res) => res.text("ok"),
        );

        expect(app.getRoutes()).toEqual([
            {
                method: "GET",
                path: "/users",
                middlewares: ["auth"],
            },
        ]);
    });

    test("middleware inheritance", () => {
        const app = new Router();

        const global: Middleware = async (req, res, next) => next();

        const api: Middleware = async (req, res, next) => next();


        app.use(global);
        app.use("/api", api);

        app.get(
            "/api/users",
            auth,
            (req, res) => res.text("ok"),
        );

        expect(app.getRoutes()).toEqual([
            {
                method: "GET",
                path: "/api/users",
                middlewares: [
                    "global",
                    "api",
                    "auth",
                ],
            },
        ]);
    });

    test("printRoutes without colors", () => {
        const app = new Router();
        app.get("/users", (req, res) => res.text("ok"));
        app.post("/users/:id", (req, res) => res.text("ok"));

        expect(app.printRoutes()).toBe("[GET     ] /users\n[POST    ] /users/:id");
    });

    test("printRoutes with colors", () => {
        const app = new Router();
        app.get("/users", (req, res) => res.text("ok"));
        app.post("/users/:id", (req, res) => res.text("ok"));

        const output = app.printRoutes({ colors: true });
        expect(output).toContain("\x1b[32mGET\x1b[0m");
        expect(output).toContain("\x1b[33mPOST\x1b[0m");
        expect(output).toContain("\x1b[34m:id\x1b[33m");
    });

    test("LoggerMiddleware logs requests", async () => {
        const logs: string[] = [];
        const app = new Router();

        app.use(LoggerMiddleware({
            colors: false,
            timestamp: true,
            output: (msg) => logs.push(msg),
        }));

        app.get("/test", (req, res) => res.json({ ok: true }));

        const routes = app.toBunRoutes();
        const handler = routes["/test"]?.GET;
        expect(handler).toBeDefined();

        const req = new Request("http://localhost/test") as any;
        req.params = {};
        await handler!(req);

        expect(logs.length).toBe(1);
        expect(logs[0]).toContain("[GET]");
        expect(logs[0]).toContain("/test");
        expect(logs[0]).toContain("[200]");
    });

    test("LoggerMiddleware respects enabled: false", async () => {
        const logs: string[] = [];
        const app = new Router();

        app.use(LoggerMiddleware({
            enabled: false,
            output: (msg) => logs.push(msg),
        }));

        app.get("/test", (req, res) => res.json({ ok: true }));

        const routes = app.toBunRoutes();
        const handler = routes["/test"]?.GET;
        expect(handler).toBeDefined();

        const req = new Request("http://localhost/test") as any;
        req.params = {};
        const res = await handler!(req);

        expect(logs.length).toBe(0);
        expect(await res.json()).toEqual({ ok: true });
    });

    test("LoggerMiddleware respects enabled predicate function", async () => {
        const logs: string[] = [];
        const app = new Router();

        app.use(LoggerMiddleware({
            enabled: (req) => req.url?.includes("/log-me") ?? false,
            output: (msg) => logs.push(msg),
        }));

        app.get("/log-me", (req, res) => res.json({ logged: true }));
        app.get("/skip-me", (req, res) => res.json({ logged: false }));

        const routes = app.toBunRoutes();

        const req1 = new Request("http://localhost/skip-me") as any;
        req1.params = {};
        await routes["/skip-me"]?.GET!(req1);
        expect(logs.length).toBe(0);

        const req2 = new Request("http://localhost/log-me") as any;
        req2.params = {};
        await routes["/log-me"]?.GET!(req2);
        expect(logs.length).toBe(1);
    });

});