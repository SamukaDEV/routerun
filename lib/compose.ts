import type { HandlerLike, IResponse, IRequest } from "./types";
import { createTrackedResponse, isErrorHandler } from "./utils";

export function compose(
    handlers: HandlerLike[],
) {
    return async (
        req: IRequest,
        res: IResponse,
    ): Promise<Response | void> => {
        const trackedRes = createTrackedResponse(res);
        let index = -1;

        async function dispatch(i: number, err?: unknown): Promise<Response | void> {
            if (i <= index) {
                throw new Error("next() called multiple times");
            }

            index = i;

            const fn = handlers[i];

            if (!fn) {
                if (err !== undefined) {
                    throw err;
                }

                const response = trackedRes.__response;
                if (response instanceof Response) {
                    return response;
                }

                return undefined;
            }

            if (err !== undefined) {
                if (!isErrorHandler(fn)) {
                    return dispatch(i + 1, err);
                }

                let downstreamResponse: Response | undefined;

                const result = await Promise.resolve(fn(
                    err,
                    req,
                    trackedRes,
                    async (nextErr?: unknown) => {
                        const downstream = await dispatch(i + 1, nextErr);
                        if (downstream instanceof Response) {
                            downstreamResponse = downstream;
                        }
                    },
                ));

                if (result !== undefined) {
                    return result;
                }

                const response = trackedRes.__response;
                if (response instanceof Response) {
                    return response;
                }

                if (downstreamResponse instanceof Response) {
                    return downstreamResponse;
                }

                return undefined;
            }

            if (isErrorHandler(fn)) {
                return dispatch(i + 1);
            }

            let downstreamResponse: Response | undefined;

            const result = await Promise.resolve(fn(
                req,
                trackedRes,
                async (nextErr?: unknown) => {
                    const downstream = await dispatch(i + 1, nextErr);
                    if (downstream instanceof Response) {
                        downstreamResponse = downstream;
                    }
                },
            ));

            if (result !== undefined) {
                return result;
            }

            const response = trackedRes.__response;

            if (response instanceof Response) {
                return response;
            }

            return downstreamResponse;
        }

        return dispatch(0);
    }
}
