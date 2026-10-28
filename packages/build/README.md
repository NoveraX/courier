<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier Build</h1>

  <p><strong>Your config, read the way every Courier tool reads it.</strong></p>

  <p>The one loader of <code>courier.config.ts</code> that Courier Studio, <code>courier-cli</code>, the standalone server, the MCP server and the runtime share: it finds the file, transpiles it, resolves your tsconfig path aliases, and reuses each module's transform across processes.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-build"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-build?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/proxy-mode/expose"><strong>Exposing endpoints</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/build">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Every Courier tool that reads your project reads it through this package, so a config that loads for one loads for all of them, with the same aliases and the same errors.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Found where you keep it</h4>
      <code>courier.config.{ts,mts,cts,js,mjs,cjs}</code>, in that order of names, in the directory you name or the nearest one above it.
    </td>
    <td width="33%" valign="top">
      <h4>Your aliases</h4>
      The tsconfig <code>paths</code> your project resolves imports through, the ones its <code>extends</code> chain brings in among them.
    </td>
    <td width="33%" valign="top">
      <h4>Transformed once</h4>
      Each module's transform is kept in <code>node_modules/.cache/courier/transform</code>, so the next process that loads an unchanged module reuses it.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-build
```

Courier's own tools bring it in as their dependency: install it yourself only when your code loads a project's config.

<br />

## Usage

```ts
import { loadCourierConfig } from "@noverax/courier-build/config"

const loaded = await loadCourierConfig({ cwd: process.cwd() })
if (loaded !== null) console.log(Object.keys(loaded.config.sources), loaded.configFile)
```

`loadCourierConfig()` returns `null` when no config file is there to load, and throws what the loader reported when a file is there and will not load — for a TypeScript config, usually an import it could not resolve.

<br />

## API

| Export | From | Purpose |
|---|---|---|
| `loadCourierConfig(options?)` | `/config` | Find and load `courier.config.{ts,mts,cts,js,mjs,cjs}`, in that order of names |
| `loadCourierConfigFile(file, options?)` | `/config` | Load one config file, found by whatever means the caller chose |
| `findConfigFileAt(cwd)` / `CONFIG_BASENAMES` | `/config` | The config file in one directory, without walking up, and the names it may have |
| `createConfigJiti(file, options?)` | `/config` | The loader the config is read with, for another of the project's files |
| `findTransformCacheDirectory(projectRoot)` | `/config` | Where transforms are kept across processes: `.cache/courier/transform` in the nearest `node_modules`, or `null` when there is no `node_modules`, the directory could hold files another user placed, or `COURIER_TRANSFORM_CACHE` is `0`, `false` or `off` |
| `createTransformCache(options?)` | `/config` | Reuse each module's transform while its bytes are unchanged, in memory and in that directory |
| `projectTransformCache(projectRoot)` | `/config` | The transforms kept in a project's `node_modules/.cache`, for a process that loads its modules once |
| `readPathAliases(projectRoot)` | `/config` | The tsconfig `paths` the loader resolves imports through |
| `unknownConfigKeys(config)` | `/config` | The keys of a config Courier does not read, which are usually typos |

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
      <a href="https://github.com/NoveraX/courier/tree/master/packages/cli"><strong>@noverax/courier-cli</strong></a><br />
      What a page may call, written from your marks and checked in CI.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
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
