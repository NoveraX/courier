<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Angular</h1>

  <p><strong>A page's routes under Angular, built from your config. No file to generate.</strong></p>

  <p>Builders that run Angular's own — <code>application</code>, <code>dev-server</code> and <code>unit-test</code> — with the routes a page's proxy client may call, read from <code>courier.config.ts</code> by the rules the proxy applies. The routes carry no address, path or middleware, and no <code>courier.routes.ts</code> is written or committed.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-angular"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-angular?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/proxy-mode/expose"><strong>Exposing endpoints</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/angular">Source</a>
  </p>
  <br />
</div>

<br />

## Install

```bash
npm install --save-dev @noverax/courier-angular
```

<br />

## Usage

Name Courier's builders in place of Angular's in `angular.json`; their options are Angular's own, flags and all, by the schemas of the Angular they were built with, and an option an earlier Angular takes that those no longer list is passed on, for Angular to check:

```json
{
  "build": { "builder": "@noverax/courier-angular:application", "options": { "browser": "src/main.ts" } },
  "serve": { "builder": "@noverax/courier-angular:dev-server", "options": { "buildTarget": "app:build" } },
  "test": { "builder": "@noverax/courier-angular:unit-test", "options": { "buildTarget": "app:build" } }
}
```

Register the config once, in a module the app's `tsconfig` takes, so `routes` is typed from it, and take the routes of the API a page calls:

```ts
// courier-env.d.ts
import type config from "./courier.config"

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config
  }
}
```

```ts side="page"
import { createProxyCaller } from "@noverax/courier/client"
import { routes } from "@noverax/courier/routes"

export const shop = createProxyCaller(routes.shop)
```

- **The config** is the `courier.config.*` in the project's root or the nearest folder above it.
- **The routes** are written to a module in a folder of the system's own, which Angular reads and so follows: under `ng serve`, or `ng build --watch`, a change to a file they came from reads them again, and Angular builds the app anew. The folder is removed when the builder ends.
- **A build** fails while the routes cannot be read, with why; a dev server keeps the routes read last, and with none read yet the module fails where it is imported, saying why.
- **The config in a page's bundle** fails it: imported as a value it would ship the server's settings and every API's definition to the browser. Import its type alone, with `import type`. The server's bundle of an app rendered on the server may take it.
- **Angular 20, 21 and 22**, through `buildApplication`, `executeDevServerBuilder` and `executeUnitTestBuilder`, each with the esbuild plugin that builds the routes.

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
