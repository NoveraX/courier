<div align="center">
  <br />

  # @noverax/nexus-studio

  **Visual debugging studio for Nexus — inspect requests, explore endpoints, and monitor your API in real time.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-studio"><img src="https://img.shields.io/npm/v/@noverax/nexus-studio?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

Nexus Studio is a standalone web UI that connects to your running application via Socket.IO. It provides a request inspector, endpoint explorer, API playground, and more.

<br />

## Install

```bash
npm install @noverax/nexus-studio
```

<br />

## Usage

### Build Plugin (recommended)

Automatically starts the Studio server during development:

```ts
// vite.config.ts
import { nexusStudio } from "@noverax/nexus-studio/vite"

export default defineConfig({
  plugins: [nexusStudio()],
})
```

Available for all major bundlers:

| Import Path | Bundler |
|---|---|
| `@noverax/nexus-studio/vite` | Vite |
| `@noverax/nexus-studio/next` | Next.js |
| `@noverax/nexus-studio/nuxt` | Nuxt |
| `@noverax/nexus-studio/webpack` | Webpack |
| `@noverax/nexus-studio/esbuild` | esbuild |
| `@noverax/nexus-studio/rollup` | Rollup |
| `@noverax/nexus-studio/astro` | Astro |

### CLI

```bash
npx nexus-studio --port 4380
```

### Programmatic

```ts
import { createStudioServer } from "@noverax/nexus-studio"

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
