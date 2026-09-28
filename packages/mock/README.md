<div align="center">
  <br />

  # @noverax/courier-mock

  **Type-safe mock server with stateful store, scenarios, and test utilities for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-mock"><img src="https://img.shields.io/npm/v/@noverax/courier-mock?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

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

Declare mocks in `courier.mocks.ts`, beside `courier.config.ts`: its default export is `defineMocks({ ... })`, with one `defineMockServer(...)` under each key. Studio lists each mock by its key, generates its routes and data from its source, and runs it — at launch when `autoStart` is set, or when you start it from the Mocks view. Studio's mock wizard can write the declarations for you; see [Add mocks from Studio](../studio/README.md#add-mocks-from-studio).

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
- `seed` sets how many records each collection starts with: `count` for every group (20 by default), and a number under a group's name for that group alone. `autoStart` defaults to `false`. A key set to `undefined` declares no mock, so one can be switched off in place.
- The records are generated from each endpoint's response schema, and pass it: the bounds, integer and `multipleOf` checks, string and array lengths, formats (`email`, `url`, `uuid`, ISO dates and times, and the other common ones), `regex` patterns and prefixes that a Zod (v4 or v3) or Valibot schema declares all hold, so a typed client validating the responses accepts them. Field names pick realistic values where the schema allows one.
- Each running mock is a process of its own that Studio starts: it loads the mocks file with Studio's loader, reusing the transforms Studio keeps, and serves that one mock on the port Studio chose.
- A mock that fails — a definition Studio cannot read, a missing package, a taken port, a crash — is reported in Studio's terminal, and its status in the Mocks view gives the reason on hover or keyboard focus. A running mock whose edited definition cannot be read keeps serving the last one that could, and says so the same way. The mock's own request log appears in Studio's terminal too; `log: "silent"` turns it off.
- A `courier.mocks.ts` that does not load — a syntax error, an import that cannot be resolved, no default export — leaves the config and its sources working, and the mocks keep serving the definitions that loaded last. Studio's terminal logs why, and a banner above the Mocks view says so until the file loads again.
- `overrides` and `scenarios` are checked against `source`: `mock` takes the source's group and endpoint names and each endpoint's response type. Write a scenario with `defineScenario<typeof api>(...)` to have it checked the same way; one without the type argument fits every mock. An endpoint declared outside any group is mocked under the collection its path starts with, `mock("users", "listUsers")`, which is not checked.
- Editing `courier.mocks.ts`, `courier.config.ts` or a module either imports restarts a running mock with the new definition. `autoStart` applies when Studio first reads the definition, or when an edit turns it on — not again after you stop the mock.

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

<br />

## Exports

| Entry Point | Description |
|---|---|
| `@noverax/courier-mock` | `defineMocks`, `defineMockServer`, `defineFactory`, `defineScenario`, `MockHttpError` |
| `@noverax/courier-mock/testing` | `createMockClient`, `createMockStore`, `createRecorder`, `replayFixtures` |
| `@noverax/courier-mock/server` | `createMockServer` — a standalone Hono-based mock server |
| `@noverax/courier-mock/contract` | Contract testing utilities |
| `@noverax/courier-mock/managed` | `runMockWorker` — the process Studio starts for each mock it runs |

<br />

## License

[MIT](../../LICENSE)
