import { describe, expect, test } from "bun:test";
import { compose, type RouteHandler, type Middleware, type NextFunction, type IRequest, type IResponse } from "../lib";

describe("Router", () => {
    test("should allow middleware and route handlers to return void", async () => {
        const order: string[] = [];

        const middleware: Middleware = async (req, res, next) => {
            order.push("mw-before");
            await next();
            order.push("mw-after");
        };

        const handler: RouteHandler = (req, res) => {
            order.push("handler");
        };

        const pipeline = compose([
            middleware,
            handler,
        ]);

        await pipeline({
            params: {},
            raw: {} as any,
            state: {},
        } as IRequest, {
            locals: {},
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any),
        } as IResponse);

        expect(order).toEqual([
            "mw-before",
            "handler",
            "mw-after",
        ]);
    });

    test("should produce a response when res.end is called without returning it", async () => {
        const pipeline = compose([
            (_req: IRequest, res: IResponse) => {
                return res.end("hello");
            },
        ]);

        const response = await pipeline({
            params: {},
            raw: {} as any,
            state: {},
        } as IRequest, {
            locals: {},
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any),
        } as IResponse);

        expect(response).toBeInstanceOf(Response);
        expect(await response?.text()).toBe("hello");
    });

    test("should execute middleware in onion order", async () => {
        const order: string[] = [];

        const middleware1: Middleware = async (req, res, next) => {
            order.push("mw1-before");

            const response = await next();

            order.push("mw1-after");

            return response;
        };

        const middleware2: Middleware = async (req, res, next) => {
            order.push("mw2-before");

            const response = await next();

            order.push("mw2-after");

            return response;
        };

        const handler = () => {
            order.push("handler");

            return new Response("OK");
        };

        const pipeline = compose([
            middleware1,
            middleware2,
            handler
        ]);

        await pipeline({
            params: {},
            raw: {} as any,
            state: {},
        } as IRequest, {
            locals: {},
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any),
        } as IResponse);

        expect(order).toEqual([
            "mw1-before",
            "mw2-before",
            "handler",
            "mw2-after",
            "mw1-after",
        ]);
    });
});