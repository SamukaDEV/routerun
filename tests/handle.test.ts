import { describe, expect, test } from "bun:test";
import Router from "../lib";

describe("Router", () => {
    test("handle dispatches matching routes and forwards params", async () => {
        const app = new Router();
        const calls: string[] = [];

        app.get("/users/:id", (req, res) => {
            calls.push(req.params.id ?? "");
            res.end("ok");
        });

        const req = {
            url: "/users/123",
            method: "GET",
        };

        let ended = false;
        let receivedError: unknown;

        await new Promise<void>((resolve) => {
            app.handle(req as any, {
                end(data?: string) {
                    ended = true;
                    expect(data).toBe("ok");
                },
            } as any, (err?: unknown) => {
                receivedError = err;
                resolve();
            });
        });

        expect(calls).toEqual(["123"]);
        expect(ended).toBe(true);
        expect(receivedError).toBeUndefined();
    });
});
