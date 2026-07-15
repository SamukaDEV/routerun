import { describe, expect, test } from "bun:test";
import {
    compose,
    type IRequest,
    type IResponse,
    type Middleware,
    type NextFunction,
    type RouteHandler
} from "../lib";
import type { BunRequest } from "bun";

describe("Router", () => {

    test("share Response locals and state", async () => {

        const pipeline = compose([
            (req: IRequest, res: IResponse, next: NextFunction) => {
                req.state.count += 1;
                res.locals.count += 1;

                return next();
            },
            (req: IRequest, res: IResponse) => {
                req.state.count += 1;
                res.locals.count += 1;
                res.locals.user.email = 'example@server.com';

                return res.json({
                    state: req.state,
                    locals: res.locals
                })
            }
        ])

        const response = await pipeline({
            params: {},
            raw: {} as any,
            state: {
                count: 1
            } as any,
            counter: 0,
            user: null,
            hit: 0,
            ms: 0,
            cookies: {} as BunRequest["cookies"],
        } as IRequest, {
            locals: {
                count: 190,
                user: {
                    name: 'guest'
                }
            } as any,
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any)
        } as IResponse);

        if (!response) {
            throw new Error("No response")
        }

        const result: any = await response.json();

        expect(result).toEqual({
            state: {
                count: 3,
            },
            locals: {
                count: 192,
                user: {
                    name: "guest",
                    email: "example@server.com",
                },
            },
        });
    });

});