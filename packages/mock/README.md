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
npm install @noverax/courier-mock @noverax/courier
```

Optional peer dependencies for the standalone mock server:

```bash
npm install hono @hono/node-server
```

<br />

## Usage

### Define a Mock Server

```ts
import { defineMockServer, defineFactory, defineScenario } from "@noverax/courier-mock"
import type { api } from "./api"

const userFactory = defineFactory<User>({
  build: (index) => ({ id: index, name: `User ${index}`, email: `user${index}@test.com` }),
})

export const mockServer = defineMockServer<typeof api>({
  seed: { users: userFactory.buildList(5) },
  handlers: {
    users: {
      getAll: ({ store }) => store.users.findAll(),
      getById: ({ store, variables }) => store.users.findById(variables.id),
    },
  },
})
```

### Test Utilities

```ts
// Import from /testing for test-only utilities
import { createMockClient, createMockStore } from "@noverax/courier-mock/testing"

const { client, history } = createMockClient<typeof api>(mockServer)
const users = await client.users.getAll()
```

<br />

## Exports

| Entry Point | Description |
|---|---|
| `@noverax/courier-mock` | `defineMockServer`, `defineFactory`, `defineScenario`, `MockHttpError` |
| `@noverax/courier-mock/testing` | `createMockClient`, `createMockStore`, `createRecorder`, `replayFixtures` |
| `@noverax/courier-mock/server` | Standalone Hono-based mock server |
| `@noverax/courier-mock/contract` | Contract testing utilities |

<br />

## License

[MIT](../../LICENSE)
