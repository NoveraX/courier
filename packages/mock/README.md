<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier Mock</h1>

  <p><strong>A backend before you have one — typed, stateful and as unreliable as you ask.</strong></p>

  <p>Mock servers generated from your API's definition, with records that pass its schemas and survive restarts, scenarios and network faults — plus an in-memory client, factories, recordings and contract tests for your test suite.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-mock"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-mock?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/studio/mock-servers"><strong>Mock servers guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/mock">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Declare mocks in `courier.mocks.ts`, beside `courier.config.ts`, and Studio runs them: routes and records generated from each endpoint's schemas, overrides checked against the source's own types, and a SQLite store that keeps what your app created. The same package gives your tests a mock client, factories, recordings of a real API and contract tests.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Generated from the definition</h4>
      Routes and records from each endpoint's response schema — bounds, formats and patterns all hold.
    </td>
    <td width="33%" valign="top">
      <h4>Records that last</h4>
      One SQLite database per mock, in <code>.courier/mocks/</code>, kept across restarts with no migrations.
    </td>
    <td width="33%" valign="top">
      <h4>Typed overrides</h4>
      <code>mock("users", "getById").rejects(404)</code>, checked against the source's group and endpoint names.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Network conditions</h4>
      Latency, bandwidth, upload limits and a share of failures — 429, 503, timeouts, cut connections.
    </td>
    <td valign="top">
      <h4>Test utilities</h4>
      An in-memory client with history, factories, and recordings of a real API replayed without the network.
    </td>
    <td valign="top">
      <h4>Contract checks</h4>
      Every endpoint's data — mock answers or recorded ones — validated against its schemas, with a report of what broke.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install --save-dev @noverax/courier-mock
```

It works with the app's own `@noverax/courier`. It also needs `hono`, and a mock server — one Studio runs, or one from `/server` — needs `@hono/node-server`. Add the ones the app does not depend on already, for development only:

```bash
npm install --save-dev hono @hono/node-server
```

Leave out any the app already lists under `dependencies`: `--save-dev` would move it out of them, and a production install would then go without it.

<br />

## Mock servers in Studio

Declare mocks in `courier.mocks.ts`, beside `courier.config.ts`: its default export is `defineMocks({ ... })`, with one `defineMockServer(...)` under each key. Studio lists each mock by its key, generates its routes and data from its source, and runs it — at launch when `autoStart` is set, or when you start it from the Mocks view. Studio's mock wizard can write the declarations for you; see [Add mocks from Studio](https://github.com/NoveraX/courier/tree/master/packages/studio#add-mocks-from-studio).

The mocks have a file of their own because `courier.config.ts` is also loaded in production — by the standalone server, and by `attachRuntime()` — where this package is not installed. Only Studio reads `courier.mocks.ts`. `courier.config.ts` has no `mocks` key: `defineConfig` does not type-check with one, and Studio reads mocks from nowhere else.

```ts
// src/api.ts
import { courier, defineApi, defineGroup } from "@noverax/courier/define"

type User = { id: number; name: string }

const { endpoint } = courier()
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
  },
})
export const api = defineApi({ baseURL: "https://api.example.com", groups: { users } })
```

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { api } from "./src/api"

export default defineConfig({ sources: { api } })
```

```ts
// courier.mocks.ts
import { defineMocks, defineMockServer } from "@noverax/courier-mock"
import { api } from "./src/api"

export default defineMocks({
  api: defineMockServer({
    source: api,
    port: 7001,
    autoStart: true,
    seed: { users: 5 },
    overrides: (mock) => {
      mock("users", "getById").rejects(404, { message: "Not found" })
    },
  }),
})
```

- `source` is the source object the mock serves. Import it from where the config does, as above, or read it from the config — `import courierConfig from "./courier.config"`, then `source: courierConfig.sources.api` — as Studio's wizard writes it. That form needs a config whose default export is `defineConfig({ sources })`: a config that exports `sources` by name only loads, but a default import of it does not type-check. In a `"type": "module"` package whose tsconfig resolves modules as Node does (`node16` or `nodenext`), import `./courier.config.js` instead; TypeScript asks for the extension there, and the wizard writes it that way. Studio loads `courier.mocks.ts` together with the config, as one module graph, so a module both import runs once, and either way the mock holds the very source object the config declares.
- The file may also be named `courier.mocks.mts`, `.cts`, `.js`, `.mjs` or `.cjs`. Studio looks for these names in that order, in the directory that holds `courier.config`, and loads the first it finds: a `courier.mocks.ts` there hides a `courier.mocks.js` beside it. A TypeScript file loads as it is, with extensionless imports and tsconfig path aliases; nothing else needs installing.
- `port` is held exactly: when it is taken, Studio says so rather than moving the mock. Without one, Studio assigns the key a port from `studio.mockBasePort` (7001 by default). The mock listens there, or on the next free port above it when another process holds it as the mock starts, and the key is assigned another when a mock declares that port. After Studio restarts, the mock can get another too. Set `port` to keep one.
- The mock answers each group at its prefix, and — for a source whose `baseURL` has a path, such as `https://api.example.com/api/v3` — under that path too, so a client pointed at the mock with only the host swapped reaches it at `/api/v3/users` as one pointed at its bare URL does at `/users`.
- `seed` sets how many records each collection starts with: `count` for every group (20 by default), and a number under a group's name for that group alone. `autoStart` defaults to `false`. A key set to `undefined` declares no mock, so one can be switched off in place.
- The records are generated from each endpoint's response schema, and pass it: the bounds, integer and `multipleOf` checks, string and array lengths, formats (`email`, `url`, `uuid`, ISO dates and times, and the other common ones), `regex` patterns and prefixes that a Zod (v4 or v3) or Valibot schema declares all hold, so a typed client validating the responses accepts them. Field names pick realistic values where the schema allows one.
- Each running mock is a process of its own that Studio starts: it loads the mocks file with Studio's loader, reusing the transforms Studio keeps, and serves that one mock on the port Studio chose.
- A mock that fails — a definition Studio cannot read, a missing package, a taken port, a crash — is reported in Studio's terminal, and its status in the Mocks view gives the reason on hover or keyboard focus. A running mock whose edited definition cannot be read keeps serving the last one that could, and says so the same way. The mock's own request log appears in Studio's terminal too; `log: "silent"` turns it off.
- A `courier.mocks.ts` that does not load — a syntax error, an import that cannot be resolved, no default export — leaves the config and its sources working, and the mocks keep serving the definitions that loaded last. Studio's terminal logs why, and a banner above the Mocks view says so until the file loads again.
- `overrides` and `scenarios` are checked against `source`: `mock` takes the source's group and endpoint names and each endpoint's response type. Write a scenario with `defineScenario<typeof api>(...)` to have it checked the same way; one without the type argument fits every mock. An endpoint declared outside any group is mocked under the collection its path starts with, `mock("users", "listUsers")`; the types cannot check that name, so a mock under another collection is refused with a `MockTargetError` that names the right one. `scenarios` is an object keyed by each scenario's name, `{ empty: defineScenario("empty", …) }`, which is how Studio and the admin API name them; an array is refused with a `ScenarioConfigError` that spells the object out.
- Editing `courier.mocks.ts`, or a module it imports, restarts a running mock whose declaration changed, or something that declaration uses — a declaration beside it, an import and every module that import reaches, a statement of the file that declares nothing. The other mocks keep running, with their records: adding a mock does not restart the ones already running. A mocks file whose mocks Studio cannot tell apart — its keys spread in or computed, or a CommonJS file — restarts every running mock on each edit. `autoStart` applies when Studio first reads the definition, or when an edit turns it on — not again after you stop the mock.
- A mock keeps its records in the project, in `.courier/mocks/` — one SQLite database per mock, saved shortly after each request and when the mock stops, and read when it starts — so what an app created is still there after the mock restarts, an edit that changes it included, and after Studio restarts. Nothing is set up by hand: the database and its schema are created on the first start, a database from an earlier Courier is brought up to date as it opens, and records are kept as JSON documents, so an API whose shapes change needs no migration. A save writes, in one transaction, only the records that changed. A database that cannot be read is kept beside the new one as `<name>.unreadable-<time>`. A collection the database holds nothing for starts from its seeds, and one the mock no longer serves is dropped. **Reset store** empties the store and seeds it again, and that is kept too. `persist: false` starts the mock from its seeds each time. The database is Node's built-in SQLite, in Node 22.13 and later; elsewhere a mock keeps its records only while it runs, and says so.

### Mock only some endpoints, or answer with recordings

A mock need not answer everything. `endpoints` names the endpoints it answers; every other HTTP call goes to the source's own server at its `baseURL`, as the app calls it — handy while the backend has all but a few endpoints. `fixtures` answers with recordings of that server in place of generated data: a call the mock has no answer to yet goes to the server once, its answer is written to a HAR file, and the same call is answered from the file from then on.

```ts
// courier.mocks.ts
import { defineMocks, defineMockServer } from "@noverax/courier-mock"
import { api } from "./src/api"

export default defineMocks({
  refunds: defineMockServer({ source: api, endpoints: ["users.getById"] }),
  demo: defineMockServer({ source: api, fixtures: "./fixtures/api.har" }),
})
```

- `endpoints` takes `group.method`, or the method alone for an endpoint outside any group, and is checked against the source: a name it does not have stops the mock with a `MockEndpointsError` that lists the names it has. Streams and channels the mock always answers itself. An endpoint left to the server is not mocked at all, so an override or a scenario for it does not apply.
- A call passed to the server carries the request's own headers, its credentials included, but none of the hop's (`host`, `origin`, `content-length`, `sec-*` and the like). The server's answer, a failure included, comes back with its status, its data and its headers.
- `fixtures` is relative to `courier.mocks.ts`. The file is a HAR log, the format browsers' developer tools open; commit it to give everyone the same answers. A recording is matched by its endpoint and its variables, and keeps no credentials: `authorization`, `cookie` and `set-cookie` are left out. An override or a scenario on an endpoint answers in place of its recordings. A call with no recording while the server cannot be reached is answered with a 502 that says so; delete the file to record everything again. A file that is not a HAR log of recordings stops the mock with a `FixtureFileError`.
- Studio's mock wizard sets both: **Answers** takes every endpoint or the ones ticked, and **Data** generated or recorded, kept in `fixtures/<key>.har` beside the mocks file. The Routes tab tags each route by what answers it, `your server` or `recorded` among them, and the mock's log says the same of each call.

### A proxy caller pointed at the mock

A mock stands in for the API itself, where a direct caller goes, and also for a Courier proxy, where a proxy caller goes. It serves the proxy's three routes:

| Route | For | As a Courier proxy serves it |
| --- | --- | --- |
| `GET`/`POST /api/request` | an HTTP call | the endpoint named by `_s`, `_g` and `_m` in the query; a read's variables in `_v`, a write's in the JSON or form body |
| `GET /api/sse` | a stream | the stream's events, the variables in `_v` |
| `/api/ws` (WebSocket) | a channel | every channel a caller subscribes to, on one socket, each by its topic |

A mock built from a source refuses at these routes what that API's own proxy refuses — an endpoint it keeps from a page, a GET to anything but a read, or to a read whose variables stay out of the address — with the proxy's status and its body, `{ "success": false, "message": … }`, so a page that works against the mock is not refused once it calls the proxy, and reads a refusal as the proxy writes it.

```ts
import { createProxyCaller } from "@noverax/courier"
import { apiRoutes } from "./courier.routes"

const mock = "http://localhost:7001"
const api = createProxyCaller(apiRoutes, {
  proxyPath: { http: `${mock}/api/request`, sse: `${mock}/api/sse`, ws: "ws://localhost:7001/api/ws" },
})
```

On `/api/ws` a subscription goes as it does on a Courier server. The variables are checked against the channel's schema, and a subscription that fails them ends with code 4422. Its topic is keyed as the channel's `.topic()` says, with a `renamed` frame first when that differs from the topic asked for, so subscribers who share a key share the channel's broadcasts. Each message is checked against what the channel `.send()`s, and one that fails is refused with 4422 while the subscription goes on. A channel that is not mocked ends with 4404, naming it and the scenario state. `ctx.close()` ends that one subscription and leaves the socket's others open. A mock built without a source checks nothing and keys each topic by its variables. Studio's mock logs show each subscription as it opens and ends.

### Uploads and large bodies

A mock reads a body as a Courier server does, at every path it serves: JSON — and a body sent with no type, or as plain text, when it is JSON — a form, `multipart/form-data` or URL-encoded, whose fields reach the handler as a record, a file as the `File` itself and a field sent more than once as a list, in order, and a file sent as the whole body, which reaches the handler as a `Blob` of its type. A file's name is kept as it was sent, `../` and all: the mock writes no file, and a generated create keeps each file in its record as its name, type and size. It reads up to 1 MB of JSON and 10 MB of form or upload, as a Courier server does; `maxBodyBytes` and `maxUploadBytes` set other limits.

```ts
// courier.mocks.ts
import { defineMocks, defineMockServer } from "@noverax/courier-mock"
import { api } from "./src/api"

export default defineMocks({
  api: defineMockServer({ source: api, maxUploadBytes: 50 * 1024 * 1024 }),
})
```

A body over its limit is answered with 413 before it is all read, and the rest is taken off the connection, so a browser still sending it hears the answer; a form that does not parse is answered 400, and so is one whose client stopped sending it. Each is answered `{ error }`, saying why. Studio's mock log shows such a request refused, with its status and the reason, and a file a request sent by its name, type and size.

### Slow and failing answers

`network` makes a mock answer as a slow or unreliable network would, and take uploads as a server with limits does: it adds latency, caps how fast answers are sent and uploads arrive, refuses an upload over a size (413) or holding a file of a type it does not take (415), and fails a share of calls with any HTTP error status, a timeout, a dropped connection or an upload cut off partway, and its stop conditions end a run on their own. Studio's **Network** tab sets the same conditions on a running mock. See [Network conditions](https://courier.noverax.cloud/docs/studio/network-conditions).

```ts
// courier.mocks.ts
import { defineMocks, defineMockServer } from "@noverax/courier-mock"
import { api } from "./src/api"

export default defineMocks({
  api: defineMockServer({
    source: api,
    network: {
      latency: "3g",
      errorRate: 0.1,
      faultTypes: ["429", "503", "interrupt"],
      uploads: { bandwidth: 1500, maxBytes: 5 * 1024 * 1024, accept: ["image/*", ".pdf"] },
    },
  }),
})
```

<br />

## Test utilities

```ts
import { courier, defineApi, defineGroup } from "@noverax/courier/define"
import { defineFactory } from "@noverax/courier-mock"
import { createMockClient } from "@noverax/courier-mock/testing"

type User = { id: number; name: string; email: string }

const { endpoint } = courier()
const users = defineGroup({ prefix: "users", endpoints: { getAll: endpoint.get("").response<User[]>() } })
const api = defineApi({ baseURL: "https://api.example.com", groups: { users } })

const userFactory = defineFactory<User>({ defaults: { id: 1, name: "Alice", email: "alice@test.com" } })

const { client, mock, history } = createMockClient<typeof api>()
mock("users", "getAll").resolves(
  userFactory.buildSequence(3, (index, base) => ({ ...base, id: index + 1, name: `User ${index + 1}` })),
)

const all = await client.users.getAll() // three users
history.length // 1
```

### Recording a real API

`createRecorder` calls a real backend from the API's definition and records each response as a fixture — a failed one too. Its client answers as the source's own client does: the data, or an `HTTPError` with the status and body.

```ts
import { createMockClient, createRecorder, replayFixtures } from "@noverax/courier-mock/testing"

const recorder = createRecorder({ source: api, targetUrl: "https://staging.example.com" })
await recorder.client.users.getAll()

const fixtures = recorder.getFixtures() // or recorder.toHar()
const { client: replayed } = createMockClient<typeof api>({ scenario: replayFixtures(fixtures) })
```

- The calls go to each endpoint's own method and path, at `targetUrl` or at the source's `baseURL`. To record through a Courier proxy — `createCourierServer`, or an app with Courier's handler — pass `proxy: { url, source }`: the proxy route's URL and the name the source has there.
- `mode` is `"record"` by default. `"passthrough"` calls the backend and records nothing; `"replay"` answers from the `fixtures` given, without the network, and rejects a call it has no recording of; `"record-missing"` replays what `fixtures` has and records the rest.
- `sanitize(data, part)` rewrites what is recorded — each call's variables (`part` is `"variables"`) and each answer's body (`"response"`) — never what the call returns. A recording made with it keeps no query in its URL, and replay passes a call's variables through the same function before looking for their recording; give `replayFixtures` and `replayHar` the sanitizer as their third argument for the same reason. `Authorization`, `Proxy-Authorization`, `Cookie` and `Set-Cookie` are never recorded. `filter` names the endpoints the recorder may call.

<br />

## Exports

| Entry Point | Description |
|---|---|
| `@noverax/courier-mock` | `defineMocks`, `defineMockServer`, `defineFactory`, `defineScenario`, `MockHttpError` |
| `@noverax/courier-mock/testing` | `createMockClient`, `createMockStore`, `createRecorder`, `replayFixtures` |
| `@noverax/courier-mock/server` | `createMockServer` — a standalone Hono-based mock server; `persist: { file }` keeps its store across restarts in an SQLite database it creates and migrates itself |
| `@noverax/courier-mock/contract` | Contract testing utilities |
| `@noverax/courier-mock/managed` | `runMockWorker` — the process Studio starts for each mock it runs |

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
      <a href="https://github.com/NoveraX/courier/tree/master/packages/react"><strong>@noverax/courier-react</strong></a><br />
      React Query hooks typed from the same definition.
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
