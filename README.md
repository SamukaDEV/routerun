# RouteRun

Router HTTP para Bun com API enxuta, suporte a middlewares e composição de rotas em TypeScript.

## Visão geral

`routerun` resolve um problema comum no ecossistema Bun: organizar rotas, middlewares e tratamento de erros com uma interface simples, sem perder integração direta com `Bun.serve({ routes })`.

A biblioteca permite:

- Definir rotas por método HTTP.
- Reutilizar middlewares por escopo (`/`, `/api`, etc.).
- Montar roteadores aninhados.
- Tratar parâmetros dinâmicos via `param()`.
- Exportar tudo para o formato nativo de rotas do Bun.

## Features

- API orientada a `Router` e `Route`.
- Middlewares e error handlers no estilo `next()`.
- Rotas por método: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` e `all`.
- Suporte a parâmetros dinâmicos (`/users/:id`) com callbacks dedicados.
- `toBunRoutes()` para uso direto com `Bun.serve`.
- `bundle()` para mapear `HTMLBundle` em prefixos de rota.
- Utilitários de inspeção de rotas (`printRoutes()`, `getRoutes()`, `getCompiledRoutes()`).
- Criação de contexto de request/response via `createContext()`.
- Composição manual de handlers via `compose()`.

## Requisitos

| Requisito | Status |
| --- | --- |
| Runtime | Bun |
| Linguagem | TypeScript |
| Versão mínima do Bun | **Preencher** (não está explícita no projeto) |

Observação: o projeto usa `@types/bun` na linha `^1.3.14`, mas isso não garante oficialmente a versão mínima de runtime suportada.

## Instalação

Com Bun:

```bash
bun add routerun
```

Se estiver desenvolvendo localmente este repositório:

```bash
bun install
```

## Quick Start

```ts
import Router from "routerun";

const app = new Router();

app.get("/", (_req, res) => {
	return res.text("Hello from routerun + Bun");
});

app.get("/health", (_req, res) => {
	return res.json({ ok: true });
});

Bun.serve({
	port: 3000,
	routes: app.toBunRoutes(),
});

console.log("Server running on http://localhost:3000");
```

## Guia de uso

### 1) Rotas por método HTTP

```ts
import Router from "routerun";

const router = new Router();

router.get("/users", (_req, res) => res.json([{ id: "1" }]));
router.post("/users", (_req, res) => res.json({ created: true }, { status: 201 }));
router.put("/users/:id", (req, res) => res.json({ updated: req.params.id }));
router.patch("/users/:id", (req, res) => res.json({ patched: req.params.id }));
router.delete("/users/:id", (req, res) => res.json({ deleted: req.params.id }));
router.options("/users", (_req, res) => res.text("OK"));

router.all("/echo", (req, res) => {
	return res.json({ method: req.method });
});
```

### 2) Middleware global e por prefixo

```ts
import Router from "routerun";

const router = new Router();

router.use((req, _res, next) => {
	req.state.requestId = crypto.randomUUID();
	return next();
});

router.use("/api", (req, _res, next) => {
	req.state.scope = "api";
	return next();
});

router.get("/api/ping", (req, res) => {
	return res.json({
		pong: true,
		requestId: req.state.requestId,
		scope: req.state.scope,
	});
});
```

### 3) Error handler

```ts
import Router from "routerun";

const router = new Router();

router.get("/boom", () => {
	throw new Error("unexpected failure");
});

router.use((err, _req, res, _next) => {
	const message = err instanceof Error ? err.message : "unknown_error";
	return res.json({ error: message }, { status: 500 });
});
```

### 4) Rotas com parâmetros e `param()`

```ts
import Router from "routerun";

const router = new Router();

router.param("id", (req, _res, next, value) => {
	if (!/^\d+$/.test(value)) {
		return next(new Error("invalid id"));
	}

	req.state.userId = Number(value);
	return next();
});

router.get("/users/:id", (req, res) => {
	return res.json({ id: req.state.userId, rawParam: req.params.id });
});

router.use((err, _req, res, _next) => {
	return res.json({ error: String(err) }, { status: 400 });
});
```

### 5) Roteadores aninhados

```ts
import Router from "routerun";

const api = new Router();
api.get("/status", (_req, res) => res.json({ api: "ok" }));

const app = new Router();
app.use("/api", api);

Bun.serve({
	port: 3000,
	routes: app.toBunRoutes(),
});
```

### 6) `bundle()` com `HTMLBundle`

```ts
import Router from "routerun";
import type { HTMLBundle } from "bun";

import homepage from "pages/home.html";

const app = new Router();

app.bundle("/", homepage);
```

### 7) Inspeção de rotas

```ts
import Router from "routerun";

const app = new Router();

app.get("/", (_req, res) => res.text("ok"));
app.get("/users/:id", (_req, res) => res.text("ok"));

console.log(app.printRoutes());
console.log(app.getRoutes());
console.log(app.getCompiledRoutes());
```

## Referência da API pública

### Exports de alto nível

| Export | Tipo | Descrição objetiva |
| --- | --- | --- |
| `Router` | classe | Estrutura principal para registro de middleware, rotas, sub-roteadores e compilação para Bun. |
| `Route` | classe | Builder de handlers por método para um caminho específico. |
| `createContext` | função | Cria `{ req, res }` com formato esperado pelos handlers da biblioteca. |
| `compose` | função | Encadeia handlers (normais e de erro) e retorna função executora. |
| `methods` | `string[]` | Lista de métodos em minúsculo derivada de métodos HTTP suportados internamente. |
| `default` | classe | Export default de `Router`. |
| `* from types` | tipos/interfaces | Tipos utilitários públicos (`IRequest`, `IResponse`, `RouteHandler`, etc.). |

### Classe `Router`

| Membro | Assinatura resumida | Descrição |
| --- | --- | --- |
| `constructor` | `new Router(options?)` | Inicializa o roteador. `options.maxNestingDepth` controla limite de aninhamento. |
| `route` | `route(path)` | Cria uma instância `Route` vinculada ao caminho. |
| `use` | `use(...)` | Registra middleware/error handler global, por path, ou monta outro `Router`. |
| `param` | `param(name, fn)` | Registra callback para parâmetros de rota com o nome informado. |
| `get/post/put/patch/delete/options/all` | `(path, ...handlers)` | Atalho para registrar handlers por método. |
| `bundle` | `bundle(path, htmlBundle)` | Associa `HTMLBundle` a um prefixo de rota no output do Bun. |
| `handle` | `handle(req, res, callback)` | Processa cadeia de camadas manualmente (uso avançado/interno). |
| `toBunRoutes` | `toBunRoutes()` | Compila tudo no formato `routes` aceito por `Bun.serve`. |
| `printRoutes` | `printRoutes()` | Retorna string ordenada com métodos e caminhos compilados. |
| `getRoutes` | `getRoutes()` | Retorna metadados resumidos das rotas compiladas. |
| `getCompiledRoutes` | `getCompiledRoutes()` | Retorna métodos, paths e handlers já compilados. |

### Classe `Route`

| Membro | Assinatura resumida | Descrição |
| --- | --- | --- |
| `constructor` | `new Route(path)` | Inicializa um agrupador de handlers por método para o caminho. |
| `get/post/put/patch/delete/options/all` | `(...handlers)` | Registra handlers para o método correspondente. |
| `getStack` | `getStack()` | Retorna stack interna dos handlers registrados. |

### Funções utilitárias exportadas

| Função | Assinatura resumida | Descrição |
| --- | --- | --- |
| `createContext` | `createContext(request, options?)` | Constrói objetos `req` e `res` para execução de handlers. |
| `compose` | `compose(handlers)` | Monta um executor assíncrono para uma lista de handlers. |

### Tipos públicos principais

| Tipo | Finalidade |
| --- | --- |
| `IRequest` | Estrutura de request usada nos handlers. |
| `IResponse` | Estrutura de response com helpers `json`, `text`, `send`, `end`. |
| `NextFunction` | Função `next(err?)` para fluxo de middleware. |
| `RouteHandler` | Handler padrão de rota/middleware. |
| `ErrorRouteHandler` | Handler de erro com assinatura `(err, req, res, next)`. |
| `RouterOptions` | Opções de configuração do `Router`. |
| `ContextOptions` | Opções de contexto (`cors`, `allowedOrigins`, `securityHeaders`). |
| `RouteInfo` | Estrutura resumida usada por `getRoutes()`. |
| `Method` | União de métodos HTTP suportados pelo tipo `BunRoute`. |

## Boas práticas e observações

- Sempre retorne uma `Response` (ou use `res.json`, `res.text`, `res.send`, `res.end`) para encerrar o fluxo de forma explícita.
- Use `next(err)` para desviar para error handlers centralizados.
- Registre `param()` para validações/regras de parâmetros reutilizáveis.
- Prefira montar domínios por sub-roteadores (`use("/api", apiRouter)`) para manter organização.
- Defina `maxNestingDepth` quando houver árvore profunda de roteadores.
- `ContextOptions.cors` e `allowedOrigins` existem no tipo, mas a aplicação explícita de CORS no response **precisa ser validada/definida conforme sua necessidade**.
- Não há método dedicado `head()` em `Router`/`Route`; se precisar de comportamento específico para `HEAD`, valide sua estratégia de mapeamento no Bun.

## Contribuição

Contribuições são bem-vindas.

Fluxo sugerido:

1. Faça um fork do projeto.
2. Crie uma branch de feature/fix (`feat/minha-feature` ou `fix/meu-ajuste`).
3. Implemente alterações e testes.
4. Rode os testes:

```bash
bun test
# OR
bun run run-tests
```

5. Abra um Pull Request descrevendo contexto, mudanças e impacto.

## Licença

Licenciado sob MIT. Consulte o arquivo `LICENSE` para detalhes.
