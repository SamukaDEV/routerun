import { describe, it, expect } from "bun:test";
import { Router } from "../lib/router";
import type { ExtractParamKeys, RouteParams, IRequest, RouteHandler } from "../lib/types";

// Type assertions
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

// Static type tests
type TestExtract1 = Expect<Equal<ExtractParamKeys<"/aluno/:idaluno/turma/:idturma">, "idaluno" | "idturma">>;
type TestExtract2 = Expect<Equal<ExtractParamKeys<"/users/:id">, "id">>;
type TestExtract3 = Expect<Equal<ExtractParamKeys<"/users/:id/profile/:section">, "id" | "section">>;
type TestExtract4 = Expect<Equal<ExtractParamKeys<"/static/path">, never>>;

type TestParams1 = Expect<Equal<RouteParams<"/aluno/:idaluno/turma/:idturma">, { idaluno: string; idturma: string }>>;
type TestParams2 = Expect<Equal<RouteParams<"/users/:id">, { id: string }>>;
type TestParams3 = Expect<Equal<RouteParams<"/static/path">, Record<string, string>>>;
type TestParams4 = Expect<Equal<RouteParams<string>, Record<string, string>>>;

describe("Type inference for route params", () => {
    it("should infer types for router.get with multiple params", () => {
        const router = new Router();

        router.get("/aluno/:idaluno/turma/:idturma", (req, res) => {
            const idaluno: string = req.params.idaluno;
            const idturma: string = req.params.idturma;
            expect(idaluno).toBeUndefined();
            expect(idturma).toBeUndefined();
        });
    });

    it("should infer types across all HTTP methods", () => {
        const router = new Router();

        router.post("/posts/:postId/comments/:commentId", (req, res) => {
            const postId: string = req.params.postId;
            const commentId: string = req.params.commentId;
            expect(postId).toBeUndefined();
            expect(commentId).toBeUndefined();
        });

        router.put("/users/:userId", (req, res) => {
            const userId: string = req.params.userId;
            expect(userId).toBeUndefined();
        });

        router.patch("/items/:itemId", (req, res) => {
            const itemId: string = req.params.itemId;
            expect(itemId).toBeUndefined();
        });

        router.delete("/orders/:orderId", (req, res) => {
            const orderId: string = req.params.orderId;
            expect(orderId).toBeUndefined();
        });

        router.options("/resources/:resId", (req, res) => {
            const resId: string = req.params.resId;
            expect(resId).toBeUndefined();
        });

        router.all("/all/:anyId", (req, res) => {
            const anyId: string = req.params.anyId;
            expect(anyId).toBeUndefined();
        });
    });

    it("should infer types with router.route()", () => {
        const router = new Router();

        router.route("/teams/:teamId/members/:memberId")
            .get((req, res) => {
                const teamId: string = req.params.teamId;
                const memberId: string = req.params.memberId;
                expect(teamId).toBeUndefined();
                expect(memberId).toBeUndefined();
            });
    });

    it("should allow chaining middleware with typed handler", () => {
        const router = new Router();

        const authMiddleware: RouteHandler = (req, res, next) => {
            next();
        };

        router.get("/org/:orgId", authMiddleware, (req, res) => {
            const orgId: string = req.params.orgId;
            expect(orgId).toBeUndefined();
        });
    });
});
