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

Declare a mock under `mocks` in `courier.config.ts`. Studio lists it by its key, generates its routes and data from the source, and runs it — at launch when `autoStart` is set, or when you start it from the Mocks view. A TypeScript config loads as it is; nothing else needs installing.

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { courier, defineApi, defineGroup } from "@noverax/courier/define"
import { defineMockServer } from "@noverax/courier-mock"

type User = { id: number; name: string }

const { endpoint } = courier()
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
  },
})
const api = defineApi({ baseURL: "https://api.example.com", groups: { users } })

export default defineConfig({
  sources: { api },
  mocks: {
    api: defineMockServer({
      source: api,
      port: 7001,
      autoStart: true,
      seed: { users: 5 },
      overrides: (mock) => {
        mock("users", "getById").rejects(404, { message: "Not found" })
      },
    }),
  },
})
```

- `port` is held exactly: when it is taken, Studio says so rather than moving the mock. Without one, Studio assigns a port from `studio.mockBasePort` (7001 by default) and keeps it for the key.
- `autoStart` defaults to `false`.
- A mock that fails — a definition Studio cannot read, a missing package, a taken port, a crash — is reported in Studio's terminal, and its status in the Mocks view gives the reason on hover or keyboard focus. A running mock whose edited definition cannot be read keeps serving the last one that could, and says so the same way. The mock's own request log appears in Studio's terminal too; `log: "silent"` turns it off.
- `overrides` and `scenarios` are checked against `source`: `mock` takes the source's group and endpoint names and each endpoint's response type. Write a scenario with `defineScenario<typeof api>(...)` to have it checked the same way; one without the type argument fits every mock. An endpoint declared outside any group is mocked under the collection its path starts with, `mock("users", "listUsers")`, which is not checked.
- Editing `courier.config.ts` restarts a running mock with the new definition. `autoStart` applies when Studio first reads the definition, or when an edit turns it on — not again after you stop the mock.

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
| `@noverax/courier-mock` | `defineMockServer`, `defineFactory`, `defineScenario`, `MockHttpError` |
| `@noverax/courier-mock/testing` | `createMockClient`, `createMockStore`, `createRecorder`, `replayFixtures` |
| `@noverax/courier-mock/server` | `createMockServer` — a standalone Hono-based mock server |
| `@noverax/courier-mock/contract` | Contract testing utilities |
| `@noverax/courier-mock/managed` | What Studio runs managed mocks with |

<br />

## License

[MIT](../../LICENSE)
