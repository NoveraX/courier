<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Create Courier</h1>

  <p><strong>Courier in your project — or a new one — in one command.</strong></p>

  <p>It finds your framework, shows what it is about to do, and once you agree writes a typed API layer, its proxy route, Studio, a mock and a page that shows it at work — then installs the packages and type-checks the result.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/create-courier"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/create-courier?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/create-courier"><strong>Create Courier guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/create-dark.png" />
    <img alt="create-courier in an Express project: the files it adds, the lines it changes in the project's own files and the packages it installs, and the question that sets it all up" src="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/create-light.png" width="880" />
  </picture>
  <br />
</div>

<br />

## Overview

One command for thirteen frameworks: Next.js, Nuxt, SvelteKit, Astro, React Router and Remix, SolidStart, React and Vue with Vite, Expo, Express, Hono, Fastify and NestJS. It never replaces a file of yours, changes yours only where their shape is known, and works before you have a backend.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>A plan first</h4>
      Every file, every changed line and every package, shown before anything is written.
    </td>
    <td width="33%" valign="top">
      <h4>Nothing replaced</h4>
      A file is only ever added; where one of yours stands, its lines are listed for you instead.
    </td>
    <td width="33%" valign="top">
      <h4>Works without a backend</h4>
      The example answers from a mock Studio runs, seeded with five users.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Your own API</h4>
      <code>--openapi</code> imports an OpenAPI, Swagger or Postman specification in place of the example.
    </td>
    <td valign="top">
      <h4>AI agents</h4>
      <code>--mcp</code> offers the API's reads to your editor's agent and adds <code>.mcp.json</code>.
    </td>
    <td valign="top">
      <h4>Your toolchain</h4>
      Your package manager, your TypeScript, your <code>tsconfig</code> — checked against, not replaced.
    </td>
  </tr>
</table>

<br />

## Quick start

```bash
npx @noverax/create-courier
```

Run it in your project. It finds the framework in your `package.json`, shows the plan, and once you agree writes it, installs the packages with your package manager, and type-checks what it added against your own `tsconfig`. Then:

```bash
npm run studio   # Courier Studio, and the mock API it runs
npm run dev      # your app: open /courier
```

`/courier` shows a page of users your API answers with — from the mock until `API_URL` names your backend — and a form that creates one, typed end to end, every call visible in Studio.

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

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/react"><strong>@noverax/courier-react</strong></a><br />
      React Query hooks typed from the same definition.
    </td>
  </tr>
</table>

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
