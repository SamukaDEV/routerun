import type { Method, RouteHandler } from "./types";

export class Layer {
    constructor(
        public readonly methods: Set<Method | 'ALL'>,
        public readonly handlers: RouteHandler[],
    ) { }

    matches(method?: Method) {
        if (this.methods.has("ALL")) {
            return true;
        }

        if (!method) {
            return false;
        }

        return this.methods.has(method);
    }
}