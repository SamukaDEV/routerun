import Router from "../lib/index";

const router = new Router();

/* 

Atualizado middlewares internos da lib para não aparecerem nas listagens das rotas como middleware

*/

router.get("/home", (req, res) => res.json("home"));
router.get("/home/:id", (req, res) => res.json("home/id"));
router.post("/home", (req, res) => res.json("post home"));
router.delete("/home/:id", (req, res) => res.json("delete home"));
router.patch("/home/:id", (req, res) => res.json("patch home"));
router.put("/home/:id", (req, res) => res.json("put home"));
router.options("/home", (req, res) => res.json("options home"));

console.log(router.getRoutes());
console.log(router.getCompiledRoutes());
console.log(router.printRoutes({ colors: true }));