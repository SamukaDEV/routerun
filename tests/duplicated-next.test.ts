import { describe, expect, test } from "bun:test";
import {
    compose,
    type IRequest,
    type IResponse,
    type Middleware
} from "../lib";
import type { BunRequest } from "bun";

describe("Router", () => {
    test("should throw an error when next() is called twice", async () => {
        const middleware: Middleware = async (req, res, next) => {
            await next();
            await next();
            return new Response();
        };

        const pipeline = compose([
            middleware,
            (req: IRequest, res: IResponse) => new Response()
        ]);

        await expect(
            pipeline({
                params: {},
                raw: {} as any,
                state: {},
                counter: 0,
                user: null,
                hit: 0,
                ms: 0,
                cookies: {} as BunRequest["cookies"]
            } as IRequest, {
                locals: {},
                json: Response.json,
                text: (data, init) => new Response(data, init),
                end: (data) => new Response(data as any)
            } as IResponse),
        ).rejects.toThrow(
            "next() called multiple times",
        );
    });
});