import Router, { RouteViewerMiddleware, LoggerMiddleware, RouteHandler } from "../lib/index";

const app = new Router();

// Middleware de Logs
app.use(LoggerMiddleware({ timestamp: true, colors: true }));

app.get("/", (req, res) => res.json({ online: true }));

const MID_TEST: RouteHandler = (req, res, next) => next()
const Authentication: RouteHandler = (req, res, next) => next()
const ContextMiddleware: RouteHandler = (req, res, next) => next()

// Suas rotas da aplicação
app.get("/users", (req, res) => res.json([{ id: 1, name: "Alice" }]));
app.post("/users", MID_TEST, (req, res) => res.json({ created: true }, { status: 201 }));
app.get("/users/:id", Authentication, (req, res) => res.json({ id: req.params.id }));
app.delete("/users/:id", Authentication, ContextMiddleware, (req, res) => res.json({ deleted: true }));

// Ativa a UI de visualização de rotas
app.use(RouteViewerMiddleware(app, {
    path: "/_debug/routes",      // Caminho para acessar a UI (padrão: "/_routes")
    title: "API Routes - Middleware",  // Título no navegador e header
    enabled: process.env.NODE_ENV !== "production", // Ativação condicional
    jsonEndpoint: true,          // Habilita endpoint /_debug/routes/json
    showStats: true,             // Exibe cards de resumo e contadores
}));

const server = Bun.serve({
    port: 3192,
    routes: app.toBunRoutes(),
});

console.log(`Servidor rodando em ${server.url}`);
console.log(`Visualizador de rotas em ${server.url}_debug/routes`);
