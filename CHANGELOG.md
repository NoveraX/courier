## [0.3.0](https://github.com/NoveraX/courier/compare/v0.2.0...v0.3.0) (2026-10-14)

The proxy now serves only the endpoints you mark, and a page's client takes the routes Courier writes from those marks instead of a boundary declared beside them — Studio as it runs, and the new `courier-cli` in CI or wherever Studio does not run. Studio's search finds what a large answer's shown part leaves out, Studio reads your `.env` files again when you save one, and a page loads less of Courier at start.

### Breaking changes

- **The proxy serves only what you mark.** An endpoint is reachable from a page only where a mark opens it: `.expose()` on the endpoint, or `expose` on its group or its API, the nearest one deciding. Before, the proxy served every endpoint nothing shut, so an endpoint written for a cron job or an admin tool was a page's to call, with your server's credentials, until someone remembered it. An API that marks nothing is now reachable from no page; `expose: true` on it opens all of it, as before. A refused call is answered exactly as a name the API does not define, and while you develop the server's log names the endpoint and the fix, once. See [Exposing Endpoints](https://courier.noverax.cloud/docs/proxy-mode/expose).
- **`defineBoundary` is removed: a page's client takes its routes.** The marks are the one place that says what a page may call. From them Courier writes `courier.routes.ts` beside your `courier.config.ts` — each endpoint a page may call and how it reaches it, typed from your API and holding nothing of its definition: Studio whenever it loads the config, and `courier-cli routes` without Studio. `createProxyCaller`, `createProxyQueryCaller` and `createProxyQueryKeys` take those routes in place of a source's name and its boundary:

  ```ts
  // 0.2
  export const boundary = defineBoundary({ source: "api", expose: { "users.list": "query" } })
  export const api = defineApi({ baseURL, boundary, groups: { users } })
  const client = createProxyCaller<typeof api>("api", { boundary, proxyPath })

  // 0.3
  const users = defineGroup({ prefix: "users", expose: true, endpoints: { list } })
  export const api = defineApi({ baseURL, groups: { users } })
  const client = createProxyCaller(apiRoutes, { proxyPath }) // from "./courier.routes"
  ```

  Commit the module with the marks, and review it as you review a permission: a `CODEOWNERS` line gives it the owners of the API. `npx @noverax/courier-cli routes --check` writes nothing and fails a CI step when it is out of date. A project without a `courier.config.ts` writes its routes by hand, held to the API by `RouteMap`. A client asked for an endpoint its routes do not name throws `ENDPOINT_NOT_IN_ROUTES` before anything is sent. `BOUNDARY_MISMATCH`, `BOUNDARY_SOURCE_MISMATCH` and `ENDPOINT_NOT_IN_BOUNDARY` are gone with the boundary, and `ProxyCallerDefaults` and `ProxyCallerArguments` are no longer exported; `ProxyCallerOptions` is. See [createProxyCaller](https://courier.noverax.cloud/docs/api/create-proxy-caller).
- **A page's client takes its `proxyPath` from its own options.** A `proxyPath` on `defineApi` no longer reaches it, since the routes carry nothing of the definition; it tells Studio's Playground where your proxy routes are. A client given none sends to `/api/request` and `/api/sse` on the page's origin, as before.
- **A read goes to the proxy as GET only where it declares `.cache()`.** Its variables then travel in the address, so a browser and a CDN may keep the answer its `.cache()` allows. Every other read goes as POST, as a write does, its variables kept out of every log between the page and your server. A call can still ask for either verb with `.with({ method })`.
- **An API Studio 0.2 imported with a proxy caller** has no mark, and its `proxy.ts` names the source in the 0.2 form. Studio writes both in the new form the next time it writes the import — `expose: true` on the API in `source.ts`, and the caller taking the routes in `proxy.ts`; until then, make those two changes by hand. See [Import an API](https://courier.noverax.cloud/docs/studio/import-api).

### CLI

- **`@noverax/courier-cli` is new: the routes without Studio.** `courier-cli routes` writes `courier.routes.ts` in a project that does not run Studio, in a script or in CI, with the code Studio writes it with, so the two write the same bytes; `--check` writes nothing and fails when the module is out of date. Install it in the project, so CI runs the version your lockfile pins. See [Exposing Endpoints](https://courier.noverax.cloud/docs/proxy-mode/expose).

### Studio

- **Studio writes the routes a page's client takes.** It writes `courier.routes.ts` as it loads the config, formatted as your project's code is, only when the module would change, and never over a file Courier did not write. `studio.routes` in `courier.config.ts` puts it elsewhere, or `false` keeps the project without one. See [defineConfig](https://courier.noverax.cloud/docs/api/config).
- **The Explorer shows which mark lets a page call each endpoint.** An endpoint a page may call is tagged `exposed`, and its definition names the mark that decided — `expose: true on users`, `marked .expose(false)`, `nothing marks it .expose()`. In proxy mode the Playground flags an endpoint no mark opens `not exposed`, and refuses to send it, saying where to open it.
- **Run an endpoint kept to the server as server code.** The Playground's `not exposed` chip opens on why the proxy refuses the endpoint, and **Run as server code** switches to Direct mode and sends the call there, on the app's runtime, as your server code does. The Explorer's Pages row opens the Playground in Direct mode on such an endpoint and sends nothing until you do. The proxy still refuses a page's call, so no endpoint has to be opened to be tested.
- **Find searches the whole of a large answer.** An answer or a body over 16 KB shows in part, and Find used to search only that part. It now searches the whole body, which the app or the mock keeps, in a worker of its own, so the page stays responsive. Matches in the parts left out show in the tree and in the raw text, with the lines numbered as in the whole body, and the line under the field says how much was found. Once the whole is no longer kept, Find searches the part shown and says why. See [Studio](https://courier.noverax.cloud/docs/studio/overview).
- **Studio reads the project's `.env` files again when you save one.** The config loads again with the new values, so a source's `baseURL`, the graph and the mocks follow without a restart. A file created after Studio started counts too. A variable the files no longer set is removed, one the process was started with keeps its value, and the log names the variables that changed, never their values. See [How Studio loads the project](https://courier.noverax.cloud/docs/studio/project-loading).
- **An import with a proxy caller marks its API for pages.** Its `source.ts` says `expose: true`, and its `proxy.ts` takes the import's routes from the project's routes module, so it reads the same whichever endpoints **Manage** adds or removes.
- **A mock refuses at its proxy routes what your proxy refuses** — an endpoint no mark opens, a GET to anything but a read, or to a read whose variables stay out of the address — with the proxy's status and its body, `{ "success": false, "message": … }`, so a page that works against the mock is not refused once it calls the proxy, and reads a refusal as the proxy writes it.
- The VS Code extension's `courier-routes` snippet writes routes by hand where Courier writes none, in place of `courier-boundary`.
- `create-courier` marks its example API, and where a page calls the API through your server it adds `courier.routes.ts`, `@noverax/courier-cli` and a `routes` script that writes the module again without Studio.

### Smaller pages

- **A page no longer bundles code only a server runs.** The terminal logger, the chain of addresses a request came through and the check of `forward` stay out of a page's bundle. A bundler that builds for the browser takes a light stand-in for each through the package's `imports` field, while Node, edge runtimes and React Native take the modules themselves. At start, a page's direct caller loads 33.4 KiB gzipped, about 6 KiB less than in 0.2, and a proxy caller with its routes 15.6 KiB, about 2 KiB less.
- **Your bundler needs to read a package's `imports` field**, as Vite, webpack 5, Rollup, esbuild, Turbopack and Metro do. See [Requirements](https://courier.noverax.cloud/docs/installation#requirements).

### Fixes

- **React Query hooks work in older browsers when a call passes its own `signal`.** In Safari before 17.4, Chrome before 116 and Firefox before 124, such a query threw a `TypeError`.
- **Asking an API for its double-submit token no longer logs a false failure in older browsers.** In Safari before 17, Chrome before 113 and Firefox before 112, reading the answer's cookies threw after the token had arrived, and the log said that asking had failed.
- **A WebSocket subscription finds its source by the names your sources declare alone**, as a call and a stream do; a topic naming a member every object has is refused by its name.

All twenty packages move to 0.3.0, `@noverax/courier-cli` among them.

[Documentation](https://courier.noverax.cloud) · [Security policy](https://github.com/NoveraX/courier/security/policy) · [Contributing](https://github.com/NoveraX/courier/blob/master/CONTRIBUTING.md)

## [0.2.0](https://github.com/NoveraX/courier/compare/v0.1.0...v0.2.0) (2026-10-14)

Identical reads now go out as one request, a browser's headers no longer replace your API's own, and your API learns the user's address from every framework.

### Breaking change

`deduplicate` is removed from `defineApi` and `createProxyCaller`. Under that name a newer call cancelled the older one to the same endpoint, whatever its variables. That is now `cancelPrevious`, which lists the reads it applies to and is checked where the API is defined:

```ts
// 0.1
createProxyCaller<typeof api>("api", { boundary, deduplicate: true })

// 0.2
createProxyCaller<typeof api>("api", { boundary, cancelPrevious: ["users.search"] })
```

To stop sending the same read twice, you no longer need this option: identical reads share one request, as described below. In Studio's events, `dedup:*` is now `call:superseded`. See [Cancelling the previous call](https://courier.noverax.cloud/docs/advanced/abort#cancelling-the-previous-call).

### One request for identical reads

- **Identical reads made at the same moment share one request.** It does not matter whether two components or two places of a page make them. Each call gets an answer of its own. This works in the browser, on the server, in React Native and through the proxy. Identical means every part of the request, including the credentials and the user's address, so a user never gets another's answer. Writes, streams and calls that follow their progress always go alone, and `coalesce: false` sends a call, an API or a proxy client's calls alone. See [Identical reads share one request](https://courier.noverax.cloud/docs/advanced/abort#identical-reads-share-one-request).
- **In Next.js, `createServerCaller` sends a read once per render.** `generateMetadata` and the page share it. See [One read per render](https://courier.noverax.cloud/docs/frameworks/nextjs#one-read-per-render).
- **`cacheMiddleware` fetches a missed entry once.** It sends one request however many callers miss that entry at once.

### Security

- **The browser can no longer override your API's headers.** A header the browser sends through the proxy, such as `Authorization`, `Referer` or `X-Request-Id`, no longer replaces one your API sets in its `headers`. The session, the call, middleware and an endpoint's own closure still apply after them.
- **The proxy can limit how often one caller calls it.** Set `rateLimit` for this. It uses GCRA, answers with `RateLimit` headers and keeps its counts in memory or in Redis through `@noverax/courier-redis`. `browsersOnly` refuses calls that carry none of a browser's marks. See [Rate limits](https://courier.noverax.cloud/docs/proxy-mode/overview#rate-limits).
- **`defineBoundary` is checked against the API it belongs to.** An exposed path stops the API where it is defined if it does not exist or has another shape. So does a `sensitive` list that disagrees with the endpoints' `sensitiveVariables`.

### The user's address and request id

- **Every adapter now passes the user's address to your API.** `X-Forwarded-For` grows as a chain, as nginx writes it.
- **You can name the headers your backend reads.** `forward.clientAddress` and `forward.requestId` take names such as `x-real-ip` or `x-request-id`. `COURIER_TRUSTED_PROXIES` names the proxies in front of you, and `COURIER_CLIENT_ADDRESS_HEADER` names the header a CDN writes. See [The user's address](https://courier.noverax.cloud/docs/deployment/overview#the-users-address).
- **Request ids from proxies and platforms are kept.** Before, the ids Kong, AWS and Google Cloud write were replaced with random ones.

### Defining APIs

- **`.defaults()` gives an endpoint's variables default values.** In `.defaults({ groupBy: "year" })`, the key becomes optional and the caller's value wins. Studio, OpenAPI and agents' tools show the default. See [Default variables](https://courier.noverax.cloud/docs/core-concepts/defining-apis#default-variables).

### Studio

- **Search a call's answer, variables and headers.** Matches are highlighted, Enter and Shift+Enter step through them, and a value's path copies as `data.cities[41].name`.
- **Studio reads the project's `.env` files before `courier.config.ts`, as your dev server does.** Use `--dotenv` to name other files.
- **Studio shows where each attached app runs.**
- **Spec jobs and formatters run in processes of their own.** Each process has a memory cap and ends when Studio does. An import's code is generated without parsing it again.
- The VS Code extension is now Courier Studio.
- Docs opens the documentation, the Explorer graph's cards no longer touch, and Courier's snippets carry its mark.

### Compatibility

- **The core runs in Safari 15.4, Chrome 97, Firefox 104 and newer.** It also runs on a page served over plain HTTP and in React Native: it no longer calls `URL.canParse` or needs `crypto.subtle`. See [Requirements](https://courier.noverax.cloud/docs/installation#requirements).
- **The core's JavaScript is published as one file per module.** A page's proxy client loads about a third less at start, and stack traces name the module.
- **Projects on `"moduleResolution": "node"` resolve every subpath.** `create-courier` lists what TypeScript 6 deprecates in your `tsconfig.json`.
- **SSE streams run in the Next.js Edge Runtime.**
- `create-courier` loads Studio's `next.config` wrapper in `next dev` only, so `next start` runs without dev dependencies. It also keeps a CRLF file's line ends.

All nineteen packages move to 0.2.0.

[Documentation](https://courier.noverax.cloud) · [Security policy](https://github.com/NoveraX/courier/security/policy) · [Contributing](https://github.com/NoveraX/courier/blob/master/CONTRIBUTING.md)

## [0.1.0](https://github.com/NoveraX/courier/compare/v0.0.0...v0.1.0) (2026-10-13)

Courier's first public release.

**Type-safe HTTP for any framework.** Define your API once in plain TypeScript, then call it from server code, or from the browser through a proxy that keeps your keys and sessions on the server, over HTTP, SSE and WebSockets. Mock it, watch every call in Studio, and hand it to AI agents as tools. No codegen, no schema files, and any backend that speaks HTTP.

### Get started

```bash
npx @noverax/create-courier
```

Run it in a Next.js, Nuxt, SvelteKit, Astro, React Router, Remix, SolidStart, React or Vue (Vite), Expo, Express, Hono, Fastify or NestJS project. It shows its plan first and replaces nothing of yours: it adds a typed example API, the route the browser calls it through, `courier.config.ts`, a mock and a page at `/courier`, installs the packages with your package manager and type-checks what it added.

Read the [documentation](https://courier.noverax.cloud) or try Studio in the [live demo](https://demo.courier.noverax.cloud).

### The client

`@noverax/courier` types every call from the definition, endpoint names, variables and answers alike, and checks them at runtime with Zod, Valibot, ArkType or any Standard Schema library.

- **Server code calls the API directly.** The browser goes through a proxy, and [`defineBoundary`](https://courier.noverax.cloud/docs/proxy-mode/boundary) names the endpoints a page may call; the API's address, paths and middleware never ship with the page.
- **Streams and channels end well.** SSE streams and WebSocket channels complete, fail or reconnect as the server says, and a shutdown tells each client when to come back.
- **Everything around the call.** Middleware for retries, auth with token refresh, caching, rate limits and logging; user sessions with CSRF protection; corporate proxies and mutual TLS; typed webhooks for Stripe, GitHub, Standard Webhooks or your own HMAC; OpenAPI export; and logs a pipeline reads, as text or JSON.

### Framework adapters

Next.js, with an App Router route and Server Actions, Nuxt, SvelteKit, Astro, React Router and Remix, SolidStart, Express, Fastify, Hono on Node.js, Bun, Deno or Cloudflare Workers, and NestJS. Each is one route that proxies typed calls with the user's session. `@noverax/courier-react` adds TanStack Query hooks typed from the same definition, with live SSE and WebSocket hooks.

### Running it

- `@noverax/courier-server` runs the proxy on its own port, for static and serverless front ends, Docker and Kubernetes, with health and readiness checks, body limits and graceful shutdown.
- `@noverax/courier-redis` carries channels, presence and stream history across replicas.

### Studio and mocks

- `@noverax/courier-studio` shows every request your app makes, live, in a timeline, an inspector and a playground. It imports OpenAPI specifications, finds where your API and its schemas drift apart, turns recorded calls into tests with `courier-studio verify`, and reports breaking changes on a pull request with `courier-studio diff`. It runs on your machine and stays off in production.
- `@noverax/courier-mock` serves mock APIs from the same definition, with typed handlers, a SQLite-backed store, scenarios, network conditions and faults, contract tests and fixtures.

### Your API for AI agents

`@noverax/courier-mcp` offers your API to AI agents as tools over stdio and Streamable HTTP. Only the endpoints you mark are offered, every call goes through your middleware, and a person confirms what cannot be undone.

### In your editor

Courier for VS Code shows every endpoint and how its calls went above each call, opens Studio beside your code and runs your recorded tests. Courier File Icons gives `courier.config.ts`, `courier.mocks.ts` and the `.courier` folder their own icons. Both are on [Open VSX](https://open-vsx.org/namespace/noverax), for VS Code, Cursor, Windsurf and VSCodium.

### Requirements

Node.js 22 or newer. Every change is tested on Linux, macOS and Windows; on Node.js 22, 24 and 26; in Chromium, Firefox and WebKit; against 25 framework versions; and in React Native through Expo.

All nineteen packages are published under `@noverax` at 0.1.0. Until 1.0, a breaking change raises the minor version.

[Documentation](https://courier.noverax.cloud) · [Security policy](https://github.com/NoveraX/courier/security/policy) · [Contributing](https://github.com/NoveraX/courier/blob/master/CONTRIBUTING.md)
