import type { BunRequest } from "bun";
import type { ContextOptions, IRequest, IResponse } from "./types";
import { createEndResponse, sanitizeParams } from "./utils";

export function createContext(
    request: BunRequest,
    options?: ContextOptions
) {
    const req: IRequest = {
        raw: request,
        method: request.method,
        url: request.url.toString(),
        originalUrl: request.url.toString(),
        baseUrl: "",
        params: sanitizeParams(request.params),
        state: {},
        counter: 0,
        hit: 0,
        ms: 0,
        cookies: {} as BunRequest["cookies"],
    }

    const responseState: { current?: Response } = {};

    const res = {
        locals: {},
        json(data, init) {
            const headers = new Headers(init?.headers);

            if (options?.securityHeaders) {
                headers.set('X-Content-Type-Options', 'nosniff');
                headers.set('X-Frame-Options', 'DENY');
                headers.set('X-XSS-Protection', '1; mode=block');
            }

            const response = Response.json(data, { ...init, headers });
            responseState.current = response;
            return response;
        },
        text(data, init) {
            const response = new Response(data, init);
            responseState.current = response;
            return response;
        },
        send(data, init) {
            if (typeof data === "string") {
                const response = new Response(data, init);
                responseState.current = response;
                return response;
            }

            const response = Response.json(data, init);
            responseState.current = response;
            return response;
        },
        end(data, encoding, callback) {
            const response = createEndResponse(data, encoding, callback);
            responseState.current = response;
            return response;
        },
        get __response() {
            return responseState.current;
        }
    } as IResponse & { __response?: Response };

    return { req, res }
}