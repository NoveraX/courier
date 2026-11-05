<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../docs/public/logos/courier-mark-light.svg" />
    <source media="(prefers-color-scheme: light)" srcset="../docs/public/logos/courier-mark-dark.svg" />
    <img alt="Courier" src="../docs/public/logos/courier-mark-dark.svg" height="40" />
  </picture>

  <h1>Courier website</h1>

  <p><strong>The landing page, the documentation with its live examples, the API reference and Courier Studio's page.</strong></p>

  <p>
    <a href="https://courier.noverax.cloud"><strong>courier.noverax.cloud</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="../README.md">Courier</a>
  </p>
  <br />
</div>

<br />

## Overview

A Next.js app, with a small Express backend the live examples call.

## Pages

| Route | What it is |
|-------|------------|
| `/` | The landing page |
| `/docs/<section>/<page>` | The documentation, written in MDX under `src/content/docs` |
| `/docs/examples/<name>` | Live examples, each calling the Express backend through Courier |
| `/reference` | The API reference, read from the documentation's API pages |
| `/studio` | Courier Studio's page |
| `/mcp` | The MCP server's page |
| `/privacy`, `/privacy/consent` | The privacy notice, and the consent to analytics a reader gives by choosing Accept, written in MDX under `src/content/legal` |
| `/docs/<section>/<page>.md` | A docs page as Markdown, for language models and agents; its `Link` header names the page as canonical |
| `/llms.txt`, `/llms-full.txt` | Every page for language models: an index linking each page's Markdown, and the whole documentation as one file; kept out of search results |
| `/search-index.json` | What search finds — every docs page and export — fetched once a page is idle rather than carried in each page |
| `/og/<page>` | Each page's social card, drawn from its title and description when the site is built; the home page's is `/opengraph-image` |

## Run it

```bash
cd docs
npm install
npm run dev
```

`npm run dev` starts both servers:

- **Next.js** on [http://localhost:3000](http://localhost:3000)
- **Express** on [http://localhost:4000](http://localhost:4000), the backend the examples call

```
Browser ──► Next.js :3000 ──► Express :4000
               │
               ├─ proxy mode:  createProxyCaller → /api/request → backend
               └─ direct mode: createCaller → backend, no proxy hop
```

## In production

The site runs as one container: the Next.js server, and beside it the
Express backend the live examples call. Only the site's own server calls the
backend — the proxy route passes on the pages' calls, and the pages and
Server Actions in direct mode make their own — so it listens inside the
container alone and sends no CORS headers: no browser calls it, and the
proxy route decides which pages may. The image is built from the
repository's root, as the site takes Courier's packages from it:

```bash
docker build -f docs/Dockerfile -t courier-site .
```

The image runs what `npm run build` puts together in `.next/standalone`:
Next's server and the files it traced, its assets, the backend bundled
into `backend.cjs`, and `launch.mjs`, which starts both
(`server/assemble.mjs`). The same server runs without Docker:

```bash
cd .next/standalone
PORT=3000 HOSTNAME=127.0.0.1 API_URL=http://127.0.0.1:4000 EXPRESS_HOST=127.0.0.1 EXPRESS_PORT=4000 node launch.mjs
```

It serves port 3000; put HTTPS in front of it. `/api/health` answers whether
it is up, and the container stops, to be started again, when either server
does. Asked to stop, the backend takes no new call and lets the answers on
their way finish, for 5 seconds at most; it waits 30 seconds at most for a
call to arrive, and 10 for its headers.

Visits are counted with Yandex Metrica on courier.noverax.cloud's production
build only, and only once the reader accepts in the bar at the foot of the
page: a local run, a preview or a test sends nothing. The counter and its page
views are in `src/site/analytics`; the reader's answer, in `src/site/consent`.

### Behind DDoS-Guard and Traefik

The site is reached through DDoS-Guard, then the Traefik that Dokploy runs,
then the site's container. The examples count each visitor by their
address, which the container reads this way:

- DDoS-Guard names the address that connected to it in `DDG-Connecting-IP`,
  whatever a visitor sent there, and appends it to `X-Forwarded-For`, whose
  earlier entries a visitor can write
  ([Configuring L7 Protection](https://ddos-guard.net/tutorials/general/l7-settings)).
- Traefik drops the `X-Forwarded-*` headers a peer it does not trust sent —
  Dokploy installs it trusting none — and names the peer it saw in
  `X-Forwarded-For`. `DDG-Connecting-IP` it passes on as it came, from
  anyone.
- Courier believes `DDG-Connecting-IP` only on a request whose nearest hop,
  as Traefik named it, is in one of DDoS-Guard's networks. A request that
  went around DDoS-Guard has its own address there instead, and is counted
  by it, whatever it sends in the header.

Only Traefik reaches the container: its port stays unpublished, as
Dokploy leaves it, since a request sent to it directly could write any
address into the chain. The container's environment names DDoS-Guard's
networks and header — in Dokploy, the application's Environment Variables,
then Deploy:

```bash
COURIER_TRUSTED_PROXIES=<DDoS-Guard's networks, comma-separated>
COURIER_CLIENT_ADDRESS_HEADER=DDG-Connecting-IP
```

The networks are the list under Firewall Settings in Configuring L7
Protection. DDoS-Guard announces no change to it, and changes it rarely:
compare the variable with the list now and then. Without the variables,
every visitor who comes through one of DDoS-Guard's edges counts as that
edge, and shares its budget.

Leave Traefik trusting no peer, as Dokploy installs it: the container is
then told of one hop, DDoS-Guard's edge, and of nothing a visitor wrote.
Set to DDoS-Guard's networks, `forwardedHeaders.trustedIPs` would keep the
`X-Forwarded-For` DDoS-Guard sends — the entries a visitor wrote, then
their address — left of that edge. Courier reads the chain from the
right and keeps the hops the proxies appended, however long or unreadable
what a visitor wrote before them, so the nearest hop is DDoS-Guard's edge
either way, and the address read is the one in `DDG-Connecting-IP`; but
the visitor's own entries then reach the site, which needs none of them.

DDoS-Guard recommends taking connections from its networks alone. Docker
publishes Traefik's ports past `ufw`'s rules, so the rule belongs in
Traefik, before the site. In Dokploy's Traefik File System, add to
`dynamic/middlewares.yml`:

```yaml
http:
  middlewares:
    ddos-guard-only:
      ipAllowList:
        sourceRange:
          - <each of DDoS-Guard's networks>
```

Then, in the application's Advanced tab, add `ddos-guard-only` to the
`middlewares` of each of its routers in the Traefik configuration. Traefik
matches `sourceRange` against the address that connected to it, which is
DDoS-Guard's. Dokploy writes that file again when the application's
domains change: check that the middleware is still listed after editing a
domain. The host's own firewall can hold the rule instead — the
`DOCKER-USER` chain, `ufw-docker`, or the provider's firewall.

DDoS-Guard does not serve HTTP/3, while Dokploy's Traefik advertises it
(`Alt-Svc: h3`) from its `websecure` entry point, which DDoS-Guard passes on
to browsers. Removing `http3` from `entryPoints.websecure` in Traefik File
System's `traefik.yml`, then restarting Traefik, stops browsers trying
QUIC first.

## Writing a page

A page is an MDX file under `src/content/docs` that opens with its metadata:

```js
export const metadata = { title: "Quick Start", description: "…", mode: "both", updated: "2026-10-14" }
```

`updated` is the day the page's text last changed: the page shows it under
its title, and the sitemap and the page's structured data hand it to search
engines. Change a page's text and set its date to that day. CI refuses a
page whose text changed under an older date; from the repository's root,
`npm run check:page-dates -- --fix` writes today's date where one is due.

## Live examples

| Example | Route |
|---------|-------|
| Basic requests | `/docs/examples/basic` |
| CRUD operations | `/docs/examples/crud` |
| Request groups | `/docs/examples/groups` |
| Path parameters | `/docs/examples/path-params` |
| Encoding | `/docs/examples/encoding` |
| File upload | `/docs/examples/upload` |
| Direct mode | `/docs/examples/direct` |
| Server Actions | `/docs/examples/actions` |
| Middleware | `/docs/examples/middleware` |
| Error handling | `/docs/examples/errors` |
| Deduplication and abort | `/docs/examples/abort` |
| Streaming | `/docs/examples/streaming` |
| Raw data | `/docs/examples/raw-data` |
| Request options | `/docs/examples/options` |
| Typed singleton | `/docs/examples/singleton` |

### Each visitor's data

The examples' users and posts are each visitor's own. A visitor who has
changed nothing reads the examples' first data — three users, four posts —
which no call changes. Their first change that goes through makes them a
copy of it, kept under the `__Host-courier-demo` cookie the backend sets
with that change: 128 random bits the backend makes, never an id a call
names itself. The site's sources name the cookie as their `session`
(`src/api/index.ts`), so Courier carries it between the browser and the
backend — through the proxy route, and from the pages and Server Actions —
and no other cookie of the site reaches the backend.

A visitor's data is kept in memory, for 30 minutes unused and for 2 hours
at most, and each visitor keeps up to 30 users and 20 posts. The backend
keeps 500 visitors' data at once. Past them, a new visitor's copy takes
the room of the data unused the longest, once that has gone unused for 5
minutes: while every visitor's data is in use, a first change is refused
503 `STORE_FULL`, with when to try again, and no one's data goes for it.
The limits are in `server/limits.ts`, with the most memory they let the
data take, which a test measures. The cookie's `__Host-` prefix needs
HTTPS, or the local machine: a visitor served over plain HTTP from another
machine keeps no changes, and the log says why.

### Each visitor's budget

Each visitor makes up to 300 calls a minute to the examples' backend, and
up to 20 of them writes: every call that is not a read, an upload and the
encoding example's echo among them. That is more than a reader trying
every example at once makes. The backend keeps the budget
(`server/budgets.ts`), where every path to it meets: the pages' calls
through the proxy route (`src/app/api/request`), the Server Actions', and
the pages' own in direct mode. It counts each call against the visitor's
address — an IPv6 one as its /64 network — and, once they have it, their
cookie: a visitor is held to the budget whether they drop the cookie or
change address.

The site's server names the visitor's address to the backend in
`X-Visitor-Address`, as Courier reads it from the request it serves
(`forward.clientAddress` in `src/api/index.ts`); how it is read behind
DDoS-Guard and Traefik is in
[Behind DDoS-Guard and Traefik](#behind-ddos-guard-and-traefik). The
backend takes the header as it comes, since only the site's server
reaches it.

A call the site's server names no address for — or one no address could
be — counts as no one's: every such call shares one budget of 30 calls a
minute, 2 of them writes, a tenth of a visitor's. A call gains nothing by
naming none, and a deploy that names no one's address shows at once: its
examples are refused, saying the calls name no visitor's address.

A visitor's first change, which makes them their copy, takes from one
more budget: the copies of the network it comes from — an IPv4 address,
or an IPv6 /48, the most one subscriber may be given — 6 in 10 minutes. A
visitor makes one copy, and keeps it while they use it; a script that
makes copy after copy to crowd the others out of the store is refused
past them.

A call past a budget is answered 429 `RATE_LIMITED`, with `Retry-After`;
every answer tells what is left of the tightest budget it took from in
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, which
the proxy route passes on to the page. A page rendered on the server, and
a Server Action, show the refusal where their data would be.

The backend counts a call before it reads any of its body. The proxy
route reads a call's JSON, only as large as the backend takes it, before
it passes the call on; of an upload it holds none
(`uploadMode: "stream"` in `src/app/api/request/examples-proxy.ts`). Past
its options, an upload goes on to the backend as it arrives: the backend
counts it before its file comes, refusing one past a budget at once, and
an upload still being sent holds only its pieces in flight, however large
its file.

## Project structure

```
docs/
├── server/              # the Express backend the examples call, and each visitor's data
└── src/
    ├── app/             # routes: the pages above, /api/request (the examples' proxy route)
    ├── content/docs/    # the documentation, one MDX file per page
    ├── api/             # the Courier sources the examples call
    ├── lib/             # the examples' callers and metadata helpers
    └── site/            # the site itself: tokens, layout, code, MDX components,
                         # the landing page, the reference and the Studio page
```

## Backend endpoints

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/users` | List users (`?page`, `?limit`, `?search`) |
| GET | `/users/:id` | Get a user |
| POST | `/users` | Create a user |
| PUT | `/users/:id` | Replace a user |
| PATCH | `/users/:id` | Update part of a user |
| DELETE | `/users/:id` | Delete a user |
| GET | `/users/:id/posts/:postId` | Nested path parameters |
| GET | `/posts`, `/posts/:id` | List posts, get a post |
| POST | `/posts` | Create a post |
| POST | `/upload` | File upload: counted as it streams in, none of it kept |
| ALL | `/echo` | Echo the request back |
| GET | `/stream` | A streamed response |
| GET | `/slow` | A response delayed by 3 s |
| GET | `/error/:code` | Answer with the given HTTP error |
| GET | `/health` | Health check |

Every answer is JSON, and none is one a cache may keep (`Cache-Control:
no-store`). The backend checks each field against its limit before it
keeps anything — the limits are in `server/limits.ts`, a body at most
16 KiB, an upload one file of at most 1 MiB — and answers whatever it
refuses as `{ "success": false, "message": "…", "code": "…" }`:

| Code | Status | When |
|------|--------|------|
| `INVALID_FIELD` | 400 | A field outside its limit, or one a call needs and left out |
| `INVALID_BODY` | 400 | A body that is not JSON, not an object of fields, or not the form it says it is |
| `BODY_TOO_LARGE` | 413 | A body or a file larger than the backend reads |
| `UPLOAD_REFUSED` | 400, 413 | A second file, a file in another field, more fields or longer ones than it reads |
| `NOT_FOUND` | 404 | A user or a post it does not have |
| `ROUTE_NOT_FOUND` | 404 | A route it does not have |
| `STORE_FULL` | 503 | A first change while every visitor's data the backend keeps is in use, in [Each visitor's data](#each-visitors-data) |
| `RATE_LIMITED` | 429 | A call past its visitor's budget, or a first change past its network's copies, in [Each visitor's budget](#each-visitors-budget) |

A failure of its own is answered 500 `INTERNAL`, its details kept to the
log; a refusal is logged as one line, at most once a minute for each code.

The pages and the backend are held to each other. A page's call to an
endpoint the sources do not describe fails to compile, in `npm run check`
and in `next build` (`tests/site/unknown-endpoints.ts`), and a test calls
every endpoint `src/lib/routes.ts` lists through the proxy, failing on one
the backend has no route for (`tests/site/endpoint-contract.test.ts`).

## Checks

```bash
npm run check          # biome and TypeScript
npm run build          # the production server, in .next/standalone
npm run test:examples  # every live example on it, in a browser
```

The site's tests run from the repository root in the `docs` Vitest project.

`npm run test:examples` drives every live example on the production server
`npm run build` put together, as its container runs it, in Chromium or the
engines `COURIER_BROWSERS` names. The browser opens the site as
`https://courier.test`, through a front with a certificate made for the
run, which stands where the CDN stands before the site: each page's calls
carry an origin that is neither localhost nor plain HTTP, as the deployed
site's do. Each Playwright worker is a visitor of its own, at an address of
its own. The browsers come from the repository's root:
`npx playwright install chromium` there.

After a deploy, the same examples run against the site itself:

```bash
SITE_URL=https://courier.noverax.cloud COURIER_BROWSERS=chromium npm run test:examples
```

Every page's calls then come from the address the run is made from, and the
tests of the visitors' budget, which would spend that address's, are
skipped; one engine keeps the run within a minute's budget.

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
