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
Express backend, which only the pages reach. The image is built from the
repository's root, as the site takes Courier's packages from it:

```bash
docker build -f docs/Dockerfile -t courier-site .
```

It serves port 3000; put HTTPS in front of it. `/api/health` answers whether
it is up, and the container stops, to be started again, when either server
does.

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

## Project structure

```
docs/
├── server/              # the Express backend the examples call
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
| POST | `/upload` | File upload |
| ALL | `/echo` | Echo the request back |
| GET | `/stream` | A streamed response |
| GET | `/slow` | A response delayed by 3 s |
| GET | `/error/:code` | Answer with the given HTTP error |
| GET | `/health` | Health check |

## Checks

```bash
npm run check   # biome and TypeScript
```

The site's tests run from the repository root in the `docs` Vitest project.

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
