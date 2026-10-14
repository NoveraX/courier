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

All nineteen packages move to 0.2.0. They are published through npm trusted publishing, with provenance.

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

All nineteen packages are published under `@noverax` at 0.1.0, with npm provenance. Until 1.0, a breaking change raises the minor version.

[Documentation](https://courier.noverax.cloud) · [Security policy](https://github.com/NoveraX/courier/security/policy) · [Contributing](https://github.com/NoveraX/courier/blob/master/CONTRIBUTING.md)
