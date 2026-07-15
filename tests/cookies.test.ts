import { describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";
import Router, { createContext, type IRequest } from "../lib";

describe("cookies", () => {

    describe("createContext", () => {
        test("req.cookies exposes the real Bun.CookieMap from the request", () => {
            const cookieMap = new Bun.CookieMap("session=abc123; theme=dark");

            const request = {
                method: "GET",
                url: "http://localhost/",
                params: {},
                cookies: cookieMap,
            } as unknown as BunRequest;

            const { req } = createContext(request);

            expect(req.cookies).toBe(cookieMap);
        });

        test("get() returns the value of an existing cookie and null for missing ones", () => {
            const request = {
                method: "GET",
                url: "http://localhost/",
                params: {},
                cookies: new Bun.CookieMap("session=abc123; theme=dark"),
            } as unknown as BunRequest;

            const { req } = createContext(request);

            expect(req.cookies.get("session")).toBe("abc123");
            expect(req.cookies.get("theme")).toBe("dark");
            expect(req.cookies.get("missing")).toBeNull();
        });

        test("has() reports presence of a cookie", () => {
            const request = {
                method: "GET",
                url: "http://localhost/",
                params: {},
                cookies: new Bun.CookieMap("theme=dark"),
            } as unknown as BunRequest;

            const { req } = createContext(request);

            expect(req.cookies.has("theme")).toBe(true);
            expect(req.cookies.has("missing")).toBe(false);
        });

        test("delete() removes a cookie from the map", () => {
            const request = {
                method: "GET",
                url: "http://localhost/",
                params: {},
                cookies: new Bun.CookieMap("session=abc123; theme=dark"),
            } as unknown as BunRequest;

            const { req } = createContext(request);

            req.cookies.delete("theme");

            expect(req.cookies.has("theme")).toBe(false);
            expect(req.cookies.get("session")).toBe("abc123");
        });
    });

    describe("via compiled routes (no real server)", () => {
        test("handler reads incoming cookies through req.cookies.get", async () => {
            const app = new Router();

            app.get("/whoami", (req, res) => {
                return res.json({
                    session: req.cookies.get("session"),
                    theme: req.cookies.get("theme"),
                });
            });

            const routes = app.toBunRoutes();

            const request = {
                method: "GET",
                url: new URL("http://localhost/whoami"),
                params: {},
                cookies: new Bun.CookieMap("session=abc123; theme=dark"),
            } as unknown as BunRequest;

            const response = await routes["/whoami"]!.GET!(request);

            expect(await response.json()).toEqual({
                session: "abc123",
                theme: "dark",
            });
        });

        test("handler set() with options is reflected in toSetCookieHeaders()", async () => {
            const app = new Router();

            app.get("/login", (req, res) => {
                req.cookies.set("session", "abc123", {
                    maxAge: 3600,
                    httpOnly: true,
                    secure: true,
                    sameSite: "strict",
                    path: "/admin",
                    domain: "example.com",
                });

                return res.json({ ok: true });
            });

            const routes = app.toBunRoutes();

            const cookieMap = new Bun.CookieMap();

            const request = {
                method: "GET",
                url: new URL("http://localhost/login"),
                params: {},
                cookies: cookieMap,
            } as unknown as BunRequest;

            await routes["/login"]!.GET!(request);

            const [setCookieHeader] = cookieMap.toSetCookieHeaders();

            expect(setCookieHeader).toContain("session=abc123");
            expect(setCookieHeader).toContain("Max-Age=3600");
            expect(setCookieHeader).toContain("HttpOnly");
            expect(setCookieHeader).toContain("Secure");
            expect(setCookieHeader).toContain("SameSite=Strict");
            expect(setCookieHeader).toContain("Path=/admin");
            expect(setCookieHeader).toContain("Domain=example.com");
        });

        test("delete() marks the cookie as expired in toSetCookieHeaders()", async () => {
            const app = new Router();

            app.get("/logout", (req, res) => {
                req.cookies.delete("session");
                return res.json({ ok: true });
            });

            const routes = app.toBunRoutes();

            const cookieMap = new Bun.CookieMap("session=abc123");

            const request = {
                method: "GET",
                url: new URL("http://localhost/logout"),
                params: {},
                cookies: cookieMap,
            } as unknown as BunRequest;

            await routes["/logout"]!.GET!(request);

            const [setCookieHeader] = cookieMap.toSetCookieHeaders();

            expect(setCookieHeader).toContain("session=");
            expect(setCookieHeader).toMatch(/Max-Age=0|Expires=/);
        });
    });

    describe("via real Bun.serve (integration)", () => {
        async function withServer(
            app: Router,
            fn: (baseUrl: string) => Promise<void>,
        ) {
            const server = Bun.serve({
                routes: app.toBunRoutes(),
                port: 0,
                fetch: () => new Response("Not Found", { status: 404 }),
            });

            try {
                await fn(server.url.toString());
            } finally {
                await server.stop(true);
            }
        }

        test("reads cookies sent by the client on the Cookie header", async () => {
            const app = new Router();

            app.get("/whoami", (req, res) => {
                return res.json({ theme: req.cookies.get("theme") });
            });

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/whoami", baseUrl), {
                    headers: { Cookie: "theme=dark; session=abc" },
                });

                expect(await response.json()).toEqual({ theme: "dark" });
            });
        });

        test("set() automatically applies a Set-Cookie header to the response", async () => {
            const app = new Router();

            app.get("/login", (req, res) => {
                req.cookies.set("session", "abc123", {
                    httpOnly: true,
                    secure: true,
                    sameSite: "strict",
                    maxAge: 3600,
                });

                return res.json({ ok: true });
            });

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/login", baseUrl));

                const setCookies = response.headers.getSetCookie();

                expect(setCookies).toHaveLength(1);
                expect(setCookies[0]).toContain("session=abc123");
                expect(setCookies[0]).toContain("HttpOnly");
                expect(setCookies[0]).toContain("Secure");
                expect(setCookies[0]).toContain("SameSite=Strict");
                expect(setCookies[0]).toContain("Max-Age=3600");
            });
        });

        test("multiple cookies set in the same response produce multiple Set-Cookie headers", async () => {
            const app = new Router();

            app.get("/login", (req, res) => {
                req.cookies.set("session", "abc123");
                req.cookies.set("theme", "dark");

                return res.json({ ok: true });
            });

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/login", baseUrl));

                const setCookies = response.headers.getSetCookie();

                expect(setCookies).toHaveLength(2);
                expect(setCookies.some((c) => c.includes("session=abc123"))).toBe(true);
                expect(setCookies.some((c) => c.includes("theme=dark"))).toBe(true);
            });
        });

        test("overwriting an existing cookie reflects the new value in Set-Cookie", async () => {
            const app = new Router();

            app.get("/refresh", (req, res) => {
                req.cookies.set("session", "new-value");
                return res.json({ ok: true });
            });

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/refresh", baseUrl), {
                    headers: { Cookie: "session=old-value" },
                });

                const setCookies = response.headers.getSetCookie();

                expect(setCookies).toHaveLength(1);
                expect(setCookies[0]).toContain("session=new-value");
            });
        });

        test("delete() expires the cookie via Set-Cookie", async () => {
            const app = new Router();

            app.get("/logout", (req, res) => {
                req.cookies.delete("session");
                return res.json({ ok: true });
            });

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/logout", baseUrl), {
                    headers: { Cookie: "session=abc123" },
                });

                const setCookies = response.headers.getSetCookie();

                expect(setCookies).toHaveLength(1);
                expect(setCookies[0]).toContain("session=");
                expect(setCookies[0]).toMatch(/Max-Age=0|Expires=/);
            });
        });

        test("cookie set in a parent middleware is visible in a nested router route", async () => {
            const app = new Router();
            const api = new Router();

            app.use((req: IRequest, res, next) => {
                req.cookies.set("visited", "true");
                return next();
            });

            api.get("/profile", (req, res) => {
                return res.json({ visited: req.cookies.get("visited") });
            });

            app.use("/api", api);

            await withServer(app, async (baseUrl) => {
                const response = await fetch(new URL("/api/profile", baseUrl));

                expect(await response.json()).toEqual({ visited: "true" });

                const setCookies = response.headers.getSetCookie();
                expect(setCookies.some((c) => c.includes("visited=true"))).toBe(true);
            });
        });
    });
});
