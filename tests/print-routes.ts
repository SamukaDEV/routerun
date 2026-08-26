import Router from "../lib/index";

const router = new Router();

/* 

Atualizado middlewares internos da lib para não aparecerem nas listagens das rotas como middleware

*/

router.get("/home", (req, res) => res.json("home"));
router.get("/home/:id", (req, res) => res.json("home/id"));

console.log(router.getRoutes());
console.log(router.getCompiledRoutes());
console.log(router.printRoutes());