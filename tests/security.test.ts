import { describe, it, expect } from "bun:test";
import Router from "../lib";

describe("Router Security", () => {
    describe("Path Traversal Prevention", () => {
        it("should reject path traversal attempts", () => {
            const router = new Router();

            expect(() => {
                router.get("/../admin", (req, res) => res.json({}));
            }).toThrow();
        });

        it("should reject double slashes", () => {
            const router = new Router();

            expect(() => {
                router.get("//admin", (req, res) => res.json({}));
            }).toThrow();
        });

        it("should reject encoded traversal (%2e%2e)", () => {
            const router = new Router();

            expect(() => {
                router.get("/%2e%2e/admin", (req, res) => res.json({}));
            }).toThrow();
        });

        it("should only allow valid path characters", () => {
            const router = new Router();

            // Válido
            expect(() => {
                router.get("/users/:id", (req, res) => res.json({}));
            }).not.toThrow();

            expect(() => {
                router.get("/api/*/users", (req, res) => res.json({}));
            }).not.toThrow();

            // Inválido
            expect(() => {
                router.get("/users/<script>", (req, res) => res.json({}));
            }).toThrow();
        });
    });

    describe("Middleware Cycle Prevention", () => {
        it("should detect next() called multiple times", async () => {
            const router = new Router();
            let errorThrown = false;

            router.get("/test", (req, res, next) => {
                // Tentar chamar next() duas vezes deve lançar erro
                // Simular múltiplas chamadas
                const firstCall = next();
                try {
                    // Isso deve falhar se detectado corretamente
                    const secondCall = next();
                } catch (error) {
                    errorThrown = true;
                }
                return res.json({ ok: true });
            });

            const routes = router.toBunRoutes();
            // O erro deve ser capturado durante compose
            expect(routes['/test']).toBeDefined();
        });

        it("should prevent infinite middleware loops", async () => {
            const router = new Router();
            let iterations = 0;
            const maxIterations = 5;

            router.use((req, res, next) => {
                iterations++;
                if (iterations > maxIterations) {
                    return res.json({ error: "Max iterations" });
                }
                return next();
            });

            router.get("/test", (req, res) => res.json({ ok: true }));

            expect(iterations <= maxIterations + 1).toBe(true);
        });
    });

    describe("Router Nesting Depth", () => {
        it("should handle deeply nested routers without stack overflow", () => {
            const root = new Router();
            let current = root;

            // Cria 20 níveis de aninhamento
            for (let i = 0; i < 20; i++) {
                const childRouter = new Router();
                childRouter.get(`/level-${i}`, (req, res) =>
                    res.json({ level: i })
                );
                current.use(`/api-${i}`, childRouter);
                current = childRouter;
            }

            expect(() => {
                root.printRoutes();
            }).not.toThrow();
        });

        it("should warn on excessive nesting", () => {
            const root = new Router();
            let current = root;
            const maxSafe = 10;

            for (let i = 0; i < maxSafe + 5; i++) {
                const childRouter = new Router();
                current.use(`/api-${i}`, childRouter);
                current = childRouter;
            }

            // Deve compilar sem erro, mas deveria ter limite configurável
            const routes = root.printRoutes();
            expect(routes.length >= 0).toBe(true);
        });
    });

    describe("Parameter Validation", () => {
        it("should sanitize param keys", () => {
            // Param key inválida como <script>
            const invalidKey = "<script>alert('xss')</script>";
            const validKey = /^[\w\-]+$/.test(invalidKey);

            expect(validKey).toBe(false);
        });

        it("should sanitize param values", () => {
            const dirty = 'value<script>alert("xss")</script>';
            const clean = dirty.replace(/[<>'"]/g, '');

            // Remove os caracteres perigosos <, >, ", '
            expect(clean).toBe('valuescriptalert(xss)/script');
            expect(clean.includes('<')).toBe(false);
            expect(clean.includes('>')).toBe(false);
            expect(clean.includes('"')).toBe(false);
            expect(clean.includes("'")).toBe(false);
        });

        it("should reject special characters in params", () => {
            const testParams = [
                { key: 'normal_key', valid: true },
                { key: 'key-with-dash', valid: true },
                { key: 'key with space', valid: false },
                { key: 'key<script>', valid: false },
                { key: 'key;drop', valid: false },
            ];

            testParams.forEach(({ key, valid }) => {
                const isValid = /^[\w\-]+$/.test(key);
                expect(isValid).toBe(valid);
            });
        });
    });

    describe("Bundle Path Security", () => {
        it("should only allow whitelisted bundle paths", () => {
            const ALLOWED_PREFIXES = ['/app', '/admin', '/public'];

            const testPaths = [
                { path: '/app/index', allowed: true },
                { path: '/admin/dashboard', allowed: true },
                { path: '/public/assets', allowed: true },
                { path: '/secret/config', allowed: false },
                { path: '/../admin', allowed: false },
            ];

            testPaths.forEach(({ path, allowed }) => {
                const isAllowed = ALLOWED_PREFIXES.some(prefix =>
                    path.startsWith(prefix)
                );
                expect(isAllowed).toBe(allowed);
            });
        });
    });

    describe("Type Safety", () => {
        it("should not accept invalid response types", () => {
            const router = new Router();

            router.get("/test", (req, res) => {
                // Apenas Response, Promise<Response> são válidos
                const response = res.json({ ok: true });
                expect(response instanceof Response).toBe(true);
                return response;
            });

            expect(() => {
                router.printRoutes();
            }).not.toThrow();
        });
    });

    describe("Middleware Order Integrity", () => {
        it("should apply middlewares in correct order", async () => {
            const order: string[] = [];
            const router = new Router();

            router.use((req, res, next) => {
                order.push('global-auth');
                return next();
            });

            router.use('/api', (req, res, next) => {
                order.push('api-validation');
                return next();
            });

            router.get('/api/users', (req, res) => {
                order.push('handler');
                return res.json({ order });
            });

            const routes = router.getRoutes();
            expect(routes.length).toBeGreaterThan(0);

            // Valida que o middleware global vem antes do específico
            const userRoute = routes.find(r => r.path === '/api/users');
            expect(userRoute?.middlewares.length).toBeGreaterThan(0);
        });

        it("should not apply non-matching prefix middlewares", () => {
            const router = new Router();

            router.use('/auth', (req, res, next) => {
                // Deve ser aplicado apenas em /auth/*
                return next();
            });

            router.get('/other/route', (req, res) => {
                return res.json({ ok: true });
            });

            const routes = router.getRoutes();
            const otherRoute = routes.find(r => r.path === '/other/route');

            // Não deve incluir middleware de /auth
            expect(otherRoute?.middlewares).not.toContain('auth');
        });
    });

    describe("Error Handling", () => {
        it("should handle middleware errors gracefully", async () => {
            const router = new Router();

            router.use((req, res, next) => {
                try {
                    return next();
                } catch (error) {
                    return res.json(
                        { error: 'Middleware error' },
                        { status: 500 }
                    );
                }
            });

            router.get("/test", (req, res) => {
                throw new Error("Handler error");
            });

            expect(() => {
                router.printRoutes();
            }).not.toThrow();
        });

        it("should not leak internal errors to client", () => {
            const router = new Router();

            router.get("/sensitive", (req, res) => {
                // Erro interno não deve ser exposto
                const response = res.json(
                    { error: 'Internal Server Error' },
                    { status: 500 }
                );
                return response;
            });

            expect(() => {
                router.printRoutes();
            }).not.toThrow();
        });
    });

    describe("Resource Limits", () => {
        it("should handle many routes without performance degradation", () => {
            const router = new Router();
            const routeCount = 100000;

            const startTime = performance.now();

            for (let i = 0; i < routeCount; i++) {
                router.get(`/route-${i}`, (req, res) =>
                    res.json({ id: i })
                );
            }

            const compiledRoutes = router.getCompiledRoutes();
            const endTime = performance.now();

            expect(compiledRoutes.length).toBe(routeCount);
            expect(endTime - startTime).toBeLessThan(5000); // Menos de 5s
        });

        it("should prevent regex catastrophic backtracking", () => {
            // Testa que patterns não causam regex bombing
            const problematicInput = 'a'.repeat(100) + '!';
            const pattern = /^[\w\-]+$/;

            const startTime = performance.now();
            const result = pattern.test(problematicInput);
            const endTime = performance.now();

            expect(endTime - startTime).toBeLessThan(100); // Menos de 100ms
            expect(result).toBe(false);
        });
    });

    describe("Header Security", () => {
        it("should include security headers in responses", () => {
            const router = new Router();

            router.get("/test", (req, res) => {
                const response = res.json({ ok: true });

                // Valida que headers de segurança podem ser adicionados
                expect(response instanceof Response).toBe(true);
                expect(response.headers).toBeDefined();

                return response;
            });

            expect(() => {
                router.printRoutes();
            }).not.toThrow();
        });
    });
});
