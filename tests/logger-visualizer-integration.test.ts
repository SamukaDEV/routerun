import { describe, it, expect } from "bun:test";
import Router, { LoggerMiddleware, RouteViewerMiddleware, createRequestLogStore } from "../lib";

describe("Logger & Visualizer Integration", () => {
    it("should capture headers, query params, body and status in RequestLogStore", async () => {
        const store = createRequestLogStore();
        const app = new Router();

        app.use(LoggerMiddleware({ store, sanitizeHeaders: ["authorization"] }));
        app.post("/api/users", (req, res) => {
            return res.json({ success: true, created: true }, { status: 201 });
        });

        // Execute POST with JSON body and custom headers
        const server = Bun.serve({
            port: 0,
            routes: app.toBunRoutes(),
        });

        const res = await fetch(`${server.url}api/users?ref=dashboard`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer secret_token_123",
                "X-Custom-Header": "foobar",
            },
            body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.success).toBe(true);

        // Verify captured log in store
        const logs = store.getLogs();
        expect(logs.length).toBe(1);

        const log = logs[0];
        expect(log.method).toBe("POST");
        expect(log.pathname).toBe("/api/users");
        expect(log.query).toEqual({ ref: "dashboard" });
        expect(log.status).toBe(201);
        expect(log.headers["x-custom-header"]).toBe("foobar");
        // Sensitive header masked
        expect(log.headers["authorization"]).toBe("********");
        // Body captured and parsed
        expect(log.body).toEqual({ name: "Alice", email: "alice@example.com" });

        server.stop();
    });

    it("should serve logs endpoints and allow clearing via RouteViewerMiddleware", async () => {
        const store = createRequestLogStore();
        const app = new Router();

        app.use(LoggerMiddleware({ store }));
        app.use(RouteViewerMiddleware(app, { path: "/_admin", store }));

        app.get("/items", (req, res) => res.json(["apple", "banana"]));

        const server = Bun.serve({
            port: 0,
            routes: app.toBunRoutes(),
        });

        // Trigger request to populate log
        await fetch(`${server.url}items`);

        // Check JSON logs endpoint
        const logsRes = await fetch(`${server.url}_admin/logs`);
        expect(logsRes.status).toBe(200);
        const logsData = await logsRes.json();
        expect(Array.isArray(logsData.logs)).toBe(true);
        expect(logsData.logs.length).toBe(1);
        expect(logsData.logs[0].pathname).toBe("/items");

        // Clear logs via POST /_admin/logs/clear
        const clearRes = await fetch(`${server.url}_admin/logs/clear`, { method: "POST" });
        expect(clearRes.status).toBe(200);
        const clearData = await clearRes.json();
        expect(clearData.ok).toBe(true);

        expect(store.size).toBe(0);

        server.stop();
    });

    it("should stream live logs via Server-Sent Events (SSE)", async () => {
        const store = createRequestLogStore();
        const app = new Router();

        app.use(LoggerMiddleware({ store }));
        app.use(RouteViewerMiddleware(app, { path: "/_debug", store }));

        app.get("/ping", (req, res) => res.text("pong"));

        const server = Bun.serve({
            port: 0,
            routes: app.toBunRoutes(),
        });

        // Connect to SSE endpoint
        const sseRes = await fetch(`${server.url}_debug/logs/stream`);
        expect(sseRes.status).toBe(200);
        expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

        const reader = sseRes.body?.getReader();
        expect(reader).toBeDefined();

        // Make another request while SSE is open
        await fetch(`${server.url}ping`);

        // Read chunks from SSE stream until log arrives
        let receivedText = "";
        while (!receivedText.includes("/ping")) {
            const { value, done } = await reader!.read();
            if (done) break;
            receivedText += new TextDecoder().decode(value);
        }

        expect(receivedText).toContain("event: log");
        expect(receivedText).toContain("/ping");

        await reader?.cancel();
        server.stop();
    });
});
