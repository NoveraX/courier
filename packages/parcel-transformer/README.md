<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Parcel</h1>

  <p><strong>A page's routes under Parcel, built from your config. No file to generate.</strong></p>

  <p>The Parcel transformer that hands every page the routes its proxy client may call, read from <code>courier.config.ts</code> by the rules the proxy applies. The routes module carries no address, path or middleware, and no <code>courier.routes.ts</code> is written or committed.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/parcel-transformer-courier"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/parcel-transformer-courier?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/proxy-mode/expose"><strong>Exposing endpoints</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/parcel-transformer">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install --save-dev @noverax/parcel-transformer-courier
```

<br />

## Usage

Run the transformer on the module `@noverax/courier/routes` ships, and on the config, in the project's `.parcelrc`:

```json
{
  "extends": "@parcel/config-default",
  "transformers": {
    "**/@noverax/courier/lib/routes/index.js": ["@noverax/parcel-transformer-courier", "..."],
    "**/courier.config.{ts,mts,cts,js,mjs,cjs}": ["@noverax/parcel-transformer-courier", "..."]
  }
}
```

Courier's packages name their modules in their `exports`, which Parcel reads once the project's `package.json` asks it to:

```json
{
  "@parcel/resolver-default": { "packageExports": true }
}
```

Register the config once, in a module of the app, so `routes` is typed from it, and take the routes of the API a page calls:

```ts
// courier-env.d.ts
import type config from "./courier.config"

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config
  }
}
```

```ts
import { createProxyCaller } from "@noverax/courier"
import { routes } from "@noverax/courier/routes"

export const shop = createProxyCaller(routes.shop)
```

- **The config** is the `courier.config.*` in the folder Parcel runs in or the nearest folder above it. Name another in the app's `package.json`: `"@noverax/parcel-transformer-courier": { "config": "apps/web/courier.config.ts" }`.
- **Parcel's cache** keeps the routes only while nothing they came from has changed: each file the config read, each path it looked for that is not there yet, each folder it listed, and each variable it looked at.
- **A build** fails while the routes cannot be read, with why. **`parcel serve`** keeps the routes read last in force when the config breaks, and warns why.
- **The config in a browser's bundle** fails it: imported as a value it would ship the server's settings and every API's definition to the browser. Import its type alone, with `import type`. A bundle for Node may take it.

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/build"><strong>@noverax/courier-build</strong></a><br />
      The same routes under Vite, webpack, Rspack, Rsbuild, esbuild, Rollup, Metro and Jest.
    </td>
  </tr>
</table>

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)
