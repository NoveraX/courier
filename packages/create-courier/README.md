<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/create-courier</h1>

  <p><strong>Courier in your project, in one command: your typed API, the route the browser calls it through, Studio and mock data.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/create-courier"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/create-courier?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/quick-start"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Run it in your project:

```bash
npx @noverax/create-courier
```

It finds the framework in your `package.json`, shows what it is about to do — the files it adds, the lines it changes in files of yours, the packages it installs — and once you agree writes them, installs the packages with your package manager, and type-checks what it added against your own `tsconfig`. Then:

```bash
npm run studio   # Courier Studio, and the mock API it runs
npm run dev      # your app: open /courier
```

`/courier` shows a page of users your API answers with — from the mock until `API_URL` names your backend — and a form that creates one, typed end to end, every call visible in Studio.

- **A plan first.** Nothing changes until you agree, or pass `--yes`; `--dry-run` shows the plan and stops, and Ctrl+C at a question stops it with nothing changed.
- **Nothing of yours is replaced.** A file is only ever added. Where a file of yours stands where Courier's would go, it is left as it is and its lines are listed for you.
- **Your files change only where their shape is known.** A plugin in `vite.config.ts`, a route in `app/routes.ts`: each change is shown line by line, made only where the file is in a shape the command knows, and checked against the file as you had it right before it is written. Elsewhere it is left to you, with the lines to add.
- **It works before you have a backend.** The example API answers from a mock Studio runs, seeded with five users, on the first free port from 7001.
- **Your toolchain stays yours.** It installs with the package manager your lockfile names, keeps the TypeScript your project has, and says how to move to 6.0 when you are ready; a project it creates is moved to 6.0 for you.

<br />

## In a new project

Point it at a folder that does not exist yet, and name the framework:

```bash
npx @noverax/create-courier shop --framework next
```

It creates the project with the framework's own generator — `create-next-app`, `sv`, `create-astro` and the others, run without a question at the major the setup is checked against — puts right what a template gets wrong for the project it makes, installs its packages, and sets Courier up in it. Express has no generator of its own: the command writes a minimal server in TypeScript. In a terminal, it asks for the framework when `--framework` is left out, and whether to offer the API to AI agents over MCP, all before it makes anything.

<br />

## With your package manager

```bash
npm create @noverax/courier
pnpm create @noverax/courier
yarn create @noverax/courier
bun create @noverax/courier
```

<br />

## What it sets up

| Framework | Where your API is served | What it changes in your files |
|---|---|---|
| Next.js | `app/api/request/route.ts`, registered from `instrumentation.ts` | `next.config` only when Studio's default port is taken |
| Nuxt | `server/api/request.ts`, registered from a Nitro plugin | Studio's module in `nuxt.config`; `app.vue` renders pages where it showed the welcome |
| SvelteKit | `src/routes/api/request/+server.ts`, registered from `hooks.server.ts` | Studio's plugin in `vite.config` |
| Astro | `src/pages/api/request.ts`, on demand, registered from the middleware | Studio's integration in `astro.config` |
| React Router, Remix | `app/routes/api.request.ts` | the routes in `app/routes.ts`; Studio's plugin in `vite.config` |
| SolidStart | `src/routes/api/request.ts` | Studio's plugin in `vite.config` |
| React with Vite | no server: the browser calls your API directly | Studio's plugin in `vite.config` |
| Vue with Vite | no server: the browser calls your API directly | Studio's plugin in `vite.config` |
| Expo | no server: the app calls your API directly | a Courier tab in the template's tabs |
| Express | a router on `/api/request` and `/courier` | the router mounted after `express()` |
| Hono | routes on `/api/request` and `/courier` | the routes mounted after `new Hono()`; `include` in a `tsconfig` that compiles `src/` |
| Fastify | a plugin on `/api/request` and `/courier` | `.courier/` kept out of `fastify start -w` |
| NestJS | a module on `/api/request` and `/courier` | the module imported into your root module |

Every setup adds `courier.config.ts` — the list of your APIs, which your server, Studio and the MCP server read — `courier.mocks.ts`, your API's definition with its Zod schemas, and the boundary that holds the browser to the endpoints it may call.

<br />

## Your own API

```bash
npx @noverax/create-courier --openapi https://petstore3.swagger.io/api/v3/openapi.json
```

Imports an OpenAPI, Swagger or Postman specification in place of the example, with Studio's own importer: the typed code written, the API declared in `courier.config.ts`.

<br />

## AI agents

```bash
npx @noverax/create-courier --mcp
```

Marks the example's reads with `.agent()` and adds `.mcp.json`, which Claude Code reads: your editor's agent can call your API, through the same middleware as your app. With `--openapi`, which of the imported endpoints agents may call is yours to say: the plan shows how to mark them.

<br />

## Options

| Option | |
|---|---|
| `[dir]` | The project's folder, or a new one to create (default: the working directory) |
| `--framework <name>` | `next`, `nuxt`, `sveltekit`, `astro`, `react-router`, `remix`, `solid-start`, `expo`, `nestjs`, `fastify`, `hono`, `express`, `react`, `vue` (default: found in `package.json`) |
| `--openapi <spec>` | Import your API from a specification, a URL or a file, in place of the example |
| `--name <name>` | The imported API's name (default: from the specification) |
| `--no-studio` | Leave Studio out |
| `--no-mocks` | Leave the example's mock out |
| `--mcp` | Offer the API's reads to AI agents in your editor |
| `--package-manager <name>` | `npm`, `pnpm`, `yarn` or `bun` (default: the project's) |
| `--no-install` | Write the files and name the install commands |
| `--yes`, `-y` | Set Courier up without asking |
| `--dry-run` | Show the plan, and change nothing |

Run without a terminal to answer — in CI, by an agent — it changes nothing unless `--yes` is passed.

<br />

## Requirements

Node.js 22 or later, and a project with a `tsconfig.json`: Courier is typed end to end. A project without TypeScript gets `typescript@^6` as a dev dependency.

<br />

## License

MIT
