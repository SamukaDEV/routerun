import { describe, expect, test } from "bun:test";
import { compose, type IRequest, type IResponse } from "../lib";

describe("Router", () => {
    test("should stop pipeline when middleware returns response", async () => {
        const order: string[] = [];

        const auth = async () => {
            order.push("auth");

            return new Response("Unauthorized", {
                status: 401,
            });
        };

        const handler = () => {
            order.push("handler");

            return new Response("OK");
        };

        const pipeline = compose([
            auth,
            handler
        ]);

        const response = await pipeline({
            params: {},
            raw: {} as any,
            state: {},
        } as unknown as IRequest, {
            locals: {},
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any)
        } as IResponse);

        if (!response) {
            throw new Error("No response");
        }

        expect(response.status).toBe(401);

        expect(order).toEqual([
            "auth",
        ]);
    });
});