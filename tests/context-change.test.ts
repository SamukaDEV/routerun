import { describe, expect, test } from "bun:test";
import {
    compose,
    type IRequest,
    type IResponse,
    type NextFunction
} from "../lib";

describe("Router", () => {
    test("middlewares can share state", async () => {
        const pipeline = compose(
            [
                async (req: IRequest, res: IResponse, next: NextFunction) => {
                    req.state.user = "Pedro";
                    return next();
                },
                (req: IRequest, res: IResponse) => {
                    return Response.json(req.state);
                },
            ],
        );

        const response = await pipeline({
            params: {},
            raw: {} as any,
            state: {},
        } as IRequest, {
            locals: {},
            json: Response.json,
            text: (data, init) => new Response(data, init),
            end: (data) => new Response(data as any)
        } as IResponse);

        expect(response).toBeInstanceOf(Response);

        if (!(response instanceof Response)) {
            throw new Error("Expected Response");
        }

        expect(await response.json()).toEqual({
            user: "Pedro",
        });
    });
});