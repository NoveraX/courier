<div align="center">
  <br />

  # @noverax/nexus-mock

  **Type-safe mock server with stateful store, scenarios, and test utilities for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-mock"><img src="https://img.shields.io/npm/v/@noverax/nexus-mock?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-mock @noverax/nexus
```

Optional peer dependencies for the standalone mock server:

```bash
npm install hono @hono/node-server
```

<br />

## Usage

### Define a Mock Server

```ts
import { defineMockServer, defineFactory, defineScenario } from "@noverax/nexus-mock"
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
import { createMockClient, createMockStore } from "@noverax/nexus-mock/testing"

const { client, history } = createMockClient<typeof api>(mockServer)
const users = await client.users.getAll()
```

<br />

## Exports

| Entry Point | Description |
|---|---|
| `@noverax/nexus-mock` | `defineMockServer`, `defineFactory`, `defineScenario`, `MockHttpError` |
| `@noverax/nexus-mock/testing` | `createMockClient`, `createMockStore`, `createRecorder`, `replayFixtures` |
| `@noverax/nexus-mock/server` | Standalone Hono-based mock server |
| `@noverax/nexus-mock/contract` | Contract testing utilities |

<br />

## License

[MIT](../../LICENSE)
