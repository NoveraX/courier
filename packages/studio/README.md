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

Courier Studio is a standalone web UI that connects to your running application via Socket.IO. It provides a request inspector, endpoint explorer, API playground, and more.

<br />

## Install

```bash
npm install @noverax/courier-studio
```

<br />

## Usage

### Build Plugin (recommended)

Automatically starts the Studio server during development:

```ts
// vite.config.ts
import { courierStudio } from "@noverax/courier-studio/vite"

export default defineConfig({
  plugins: [courierStudio()],
})
```

Available for all major bundlers:

| Import Path | Bundler |
|---|---|
| `@noverax/courier-studio/vite` | Vite |
| `@noverax/courier-studio/next` | Next.js |
| `@noverax/courier-studio/nuxt` | Nuxt |
| `@noverax/courier-studio/webpack` | Webpack |
| `@noverax/courier-studio/esbuild` | esbuild |
| `@noverax/courier-studio/rollup` | Rollup |
| `@noverax/courier-studio/astro` | Astro |

### CLI

```bash
npx courier-studio --port 4380
```

### Programmatic

```ts
import { createStudioServer } from "@noverax/courier-studio"

const studio = await createStudioServer({ port: 4380 })
// studio.url → "http://localhost:4380"
// await studio.close()
```

<br />

## API

### `createStudioServer(options?: StudioServerOptions): Promise<StudioServer>`

Starts the Studio server. Returns an object with `url`, `sessions`, and `close()`.

<br />

## License

[MIT](../../LICENSE)
