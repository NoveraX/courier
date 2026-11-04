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
at most; the backend keeps 500 visitors' data at once, the one unused the
longest going first, and each visitor up to 30 users and 20 posts. The
limits are in `server/limits.ts`, with the most memory they let the data
take, which a test measures. The cookie's `__Host-` prefix needs HTTPS, or
the local machine: a visitor served over plain HTTP from another machine
keeps no changes, and the log says why.

### The proxy route's limits

The examples' proxy route (`src/app/api/request`) holds each caller — the
user's address, as the deployment's proxies report it — to 300 calls a
minute, 20 of them writes, and answers a call past either with 429 and
`Retry-After`. It reads a call's body only as large as the backend takes
it. Behind a CDN or a DDoS filter on public addresses, name the filter's
ranges in `COURIER_TRUSTED_PROXIES` and the header it names the user in in
`COURIER_CLIENT_ADDRESS_HEADER` (see the docs' Deployment page): otherwise
every user it passes on counts as one of the filter's own addresses.
Server Actions and the pages in direct mode call the backend without the
proxy route; what they can make it keep is held by the limits above.

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
test of the proxy route's limit, which would spend that address's writes,
is skipped; one engine keeps the run within a minute's writes.

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
