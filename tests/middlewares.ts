import Router, { RouteViewerMiddleware, LoggerMiddleware } from "../lib/index";

const app = new Router();

// Middleware de Logs
app.use(LoggerMiddleware({ timestamp: true, colors: true }));

app.get("/", (req, res) => res.json({ online: true }));

// Suas rotas da aplicação
app.get("/users", (req, res) => res.json([{ id: 1, name: "Alice" }]));
app.post("/users", (req, res) => res.json({ created: true }, { status: 201 }));
app.get("/users/:id", (req, res) => res.json({ id: req.params.id }));
app.delete("/users/:id", (req, res) => res.json({ deleted: true }));

// Ativa a UI de visualização de rotas
app.use(RouteViewerMiddleware(app, {
    path: "/_debug/routes",      // Caminho para acessar a UI (padrão: "/_routes")
    title: "Minha API - Rotas",  // Título no navegador e header
    enabled: process.env.NODE_ENV !== "production", // Ativação condicional
    jsonEndpoint: true,          // Habilita endpoint /_debug/routes/json
    showStats: true,             // Exibe cards de resumo e contadores
}));

Bun.serve({
    port: 3000,
    routes: app.toBunRoutes(),
});

console.log("Servidor rodando em http://localhost:3000");
console.log("Visualizador de rotas em http://localhost:3000/_debug/routes");
