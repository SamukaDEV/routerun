import { Router } from "./router";
import type { CompiledRoute } from "./types";

export function compileRoutes(
    router: Router,
): CompiledRoute[] {
    return router
        .getRoutes()
        .map(route => ({
            method: route.method,
            path: route.path,
            handlers: [],
        }));
}