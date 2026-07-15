import { describe, expect, test } from "bun:test";
import Router from "../lib";

describe("Router", () => {
    test("test implementation", async () => {
        const app = new Router();

        const order: string[] = [];

        app.use(async (req, res, next) => {
            order.push("global-before");

            const response = await next();

            order.push("global-after");

            return response;
        });

        app.get(
            "/hello",
            async (req, res, next) => {
                order.push("route-before");

                const response = await next();

                order.push("route-after");

                return response;
            },
            () => {
                order.push("handler");
                return new Response("OK");
            },
        );

        const routes = app.toBunRoutes();

        await routes["/hello"]!.GET!(
            {
                params: {},
                method: "GET",
                url: new URL("http://localhost/hello"),
            } as any,
        );

        expect(order).toEqual([
            "global-before",
            "route-before",
            "handler",
            "route-after",
            "global-after",
        ]);
    });
});