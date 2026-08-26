import Router, { RouteHandler } from "../lib/index";

const router = new Router();

const stub: RouteHandler = (req, res) => { };

router.get("/", stub);
router.get("/list", stub);
router.get("/list/:id", stub);
router.post("/entry", stub);
router.options("/entry/:id", stub);
router.put("/entry/:id", stub);
router.delete("/entry/:id", stub);
router.patch("/entry/:id", stub);

console.log(router.printRoutes({ colors: true }));