<div align="center">
  <br />

  # @noverax/nexus-studio-core

  **Instrumentation core for Nexus Studio — EventBus, event types, and Socket.IO connector.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-studio-core"><img src="https://img.shields.io/npm/v/@noverax/nexus-studio-core?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

This package instruments your Nexus application and streams events (requests, responses, cache hits, validation, etc.) to the Studio UI over Socket.IO. It is automatically integrated by the Studio build plugins — you typically do not install it manually.

<br />

## Install

```bash
npm install @noverax/nexus-studio-core @noverax/nexus
```

Optional peer dependency for live streaming to Studio:

```bash
npm install socket.io-client
```

<br />

## Usage

### Connect to Studio (client-side)

```ts
import { connectStudio } from "@noverax/nexus-studio-core"

const connection = connectStudio({
  url: "http://localhost:4380",
  framework: "next",
})

// connection.disconnect()
```

### Instrument a Server

```ts
import { instrumentServer } from "@noverax/nexus-studio-core"

instrumentServer({
  url: "http://localhost:4380",
  framework: "next",
  sources,
})
```

### Register Sources

```ts
import { registerSources, getSources } from "@noverax/nexus-studio-core"

registerSources({ api })
const sources = getSources() // → { api }
```

<br />

## API

### `connectStudio(options)` — Connect to Studio server from client
### `instrumentServer(options)` — Instrument server-side requests and stream to Studio
### `getStudioConnection()` — Get the current active connection
### `EventBus` — Global event bus for Studio events
### `registerSources(sources)` — Register API sources for Studio introspection
### `extractSourceMap(sources)` — Extract endpoint metadata for the Studio UI

<br />

## License

[MIT](../../LICENSE)
