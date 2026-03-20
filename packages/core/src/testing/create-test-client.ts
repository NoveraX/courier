import { buildClientProxy } from "../client/proxy";
import type { ExecuteBackend } from "../client/types";
import type { DefinedApi } from "../define/types";
import { HTTPError } from "../error";
import { createMockBuilder, type MockHandler } from "./mock-builder";
import type { HistoryEntry, MockBuilder, TestClient } from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Create an in-memory test client that mocks endpoint responses
 * and records request history — no real HTTP calls.
 *
 * @example
 * ```ts
 * const { client, mock, history } = createTestClient<typeof api>();
 *
 * mock("users", "getAll").resolves([{ id: "1", name: "Alice" }]);
 * const users = await client.users.getAll();
 *
 * expect(users).toEqual([{ id: "1", name: "Alice" }]);
 * expect(history).toHaveLength(1);
 * ```
 */
export function createTestClient<T extends DefinedApi<any> = DefinedApi<any>>(): TestClient<T> {
  const mocks = new Map<string, MockHandler[]>();
  const history: HistoryEntry[] = [];
  const mockKey = (group: string, method: string) => `${group}/${method}`;

  const backend: ExecuteBackend = async (group, method, variables, _options, _raw) => {
    const handler = getMock(mocks, mockKey(group, method));
    const entry: HistoryEntry = { group, method, variables, timestamp: Date.now() };

    if (!handler) {
      const error = new Error(
        `[nexus/testing] No mock for "${group}.${method}". ` +
          `Call mock("${group}", "${method}").resolves(data) first.`,
      );
      entry.error = error;
      history.push(entry);
      throw error;
    }

    if (handler.delayMs) await sleep(handler.delayMs);

    if (handler.isError) {
      const httpError = new HTTPError({
        status: handler.status,
        headers: new Headers(),
        data: handler.data,
      });
      entry.error = httpError;
      entry.result = { status: handler.status, data: handler.data };
      history.push(entry);
      throw httpError;
    }

    const data = handler.resolver ? await handler.resolver(variables) : handler.data;
    entry.result = { status: handler.status, data };
    history.push(entry);
    return data;
  };

  function mock(group: string, method: string): MockBuilder<unknown> {
    const k = mockKey(group, method);
    if (!mocks.has(k)) mocks.set(k, []);
    const handler: MockHandler = { status: 200, isError: false };
    mocks.get(k)?.push(handler);
    return createMockBuilder(handler);
  }

  return {
    client: buildClientProxy(backend) as TestClient<T>["client"],
    mock: mock as TestClient<T>["mock"],
    history,
    reset() {
      mocks.clear();
      history.length = 0;
    },
    resetMocks() {
      mocks.clear();
    },
    resetHistory() {
      history.length = 0;
    },
  };
}

function getMock(mocks: Map<string, MockHandler[]>, key: string): MockHandler | undefined {
  const handlers = mocks.get(key);
  if (!handlers?.length) return undefined;

  // Stack: latest mock wins, consumed mocks are popped
  const handler = handlers[handlers.length - 1]!;

  if (handler.remaining !== undefined) {
    handler.remaining--;
    if (handler.remaining <= 0) handlers.pop();
  }

  return handler;
}
