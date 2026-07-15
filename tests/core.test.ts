import { describe, expect, test } from "bun:test";
import Router, { type Middleware, type RouteHandler } from "../lib";

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

});