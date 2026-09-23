<div align="center">
  <br />

  # @noverax/courier-studio

  **Visual debugging studio for Courier — inspect requests, explore endpoints, and monitor your API in real time.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-studio"><img src="https://img.shields.io/npm/v/@noverax/courier-studio?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

Courier Studio is a development server with a web UI: a request inspector, an endpoint explorer, an API playground, and more. You run it next to your app, and your app connects to it — the server side through `attachRuntime()`, the browser side through one of the build integrations below.

<br />

## Install

```bash
npm install --save-dev @noverax/courier-studio @noverax/courier-studio-core
```

`@noverax/courier-studio-core` is what your server instrumentation imports. An app that only connects its browser through a build integration can leave it out.

<br />

## Start Studio

```bash
npx courier-studio
```

Studio listens on `http://localhost:6280`, or on the `studio.host` and `studio.port` of your `courier.config.ts`. Server runtimes and the build plugins read the same block, so moving Studio there moves them with it. Flags: `--port`, `--host`, `--cwd` (project root), `--open` (open a browser). `npx courier-studio init` adds Studio's `.courier/` cache directory to `.gitignore`.

The build integrations connect your app to Studio; they do not start it.

<br />

## Connect the browser

Every integration connects only outside production (`NODE_ENV !== "production"`); pass `{ enabled: true }` or `{ enabled: false }` to decide yourself.

| Import path | For | Register |
|---|---|---|
| `@noverax/courier-studio/vite` | Vite, and the frameworks built on it | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/react`, `/vue`, `/sveltekit`, `/remix`, `/solid` | React, Vue, SvelteKit, React Router (Remix), SolidStart — the Vite plugin under a framework name | `plugins: [courierStudio()]` in `vite.config.ts` |
| `@noverax/courier-studio/astro` | Astro | `integrations: [courierStudio()]` |
| `@noverax/courier-studio/nuxt` | Nuxt, with any of its builders | `modules: [courierStudioModule]` |
| `@noverax/courier-studio/next` | Next.js under webpack | `export default withCourierStudio()(nextConfig)` |
| `@noverax/courier-studio/webpack` | webpack | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/esbuild` | esbuild | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/rollup` | Rollup | `plugins: [courierStudio()]` |
| `@noverax/courier-studio/angular` | Angular | `setupCourierStudio()` in `main.ts` |

```ts
// vite.config.ts
import { courierStudio } from "@noverax/courier-studio/vite"

export default defineConfig({
  plugins: [courierStudio()],
})
```

### Next.js

Next.js 16 builds with Turbopack, which runs no webpack plugins. Connect the browser from `instrumentation-client.ts` (Next.js 15.3 and later, under either bundler):

```ts
// instrumentation-client.ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

if (process.env.NODE_ENV === "development") {
  attachRuntime("next-browser")
}
```

A browser bundle cannot read `courier.config.ts`, so when Studio is not at the default address, pass it through `env: { COURIER_STUDIO_URL: "http://localhost:7000" }` in `next.config.ts`.

Under webpack — Next.js 14 and 15 by default, `next dev --webpack` since — `withCourierStudio()` connects the browser without that file. Under Turbopack it leaves your config untouched and prints the snippet above if the file is missing.

### Nuxt

Import the module rather than naming it as a string, and pass options in the tuple form:

```ts
// nuxt.config.ts
import { courierStudioModule } from "@noverax/courier-studio/nuxt"

export default defineNuxtConfig({
  modules: [courierStudioModule],
})
```

### Angular

```ts
// src/main.ts
import { setupCourierStudio } from "@noverax/courier-studio/angular"

setupCourierStudio() // or setupCourierStudio({ studioUrl: "http://localhost:7000" })

bootstrapApplication(AppComponent, appConfig)
```

<br />

## Connect the server

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

await attachRuntime()
```

Call it once at startup — from `instrumentation.ts` in Next.js, a Nitro plugin in Nuxt, `hooks.server.ts` in SvelteKit, or before `listen()` in a Node server. See [`@noverax/courier-studio-core`](../studio-core/README.md).

<br />

## Programmatic

```ts
import { createStudioServer } from "@noverax/courier-studio/server"

const studio = createStudioServer({
  port: 6280,
  onReady: (url) => console.log(`Studio at ${url}`),
  onError: (error) => console.error(error.message),
})

await studio.close()
```

### `createStudioServer(options?: StudioServerOptions): StudioServer`

Starts Studio and returns at once with `url` and `close()`. `onReady` fires once it listens; `onError` fires instead when it cannot — the port is taken, or the host cannot be bound. Options: `port`, `host`, `projectRoot`, `mockBasePort`, `extraCorsOrigins`, `onReady`, `onError`.

<br />

## License

[MIT](../../LICENSE)
