import { buildClientProxy } from "../client/proxy";
import type { ExecuteBackend } from "../client/types";
import type { DefinedApi } from "../define/types";
import { HTTPError } from "../errors";
import { createMockBuilder, type MockHandler } from "./mock-builder";
import { createMockSSESubscription } from "./mock-sse";
import { createMockWSChannel } from "./mock-ws";
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
export function createTestClient<T extends DefinedApi = DefinedApi>(): TestClient<T> {
  const mocks = new Map<string, MockHandler[]>();
  const history: HistoryEntry[] = [];
  const mockKey = (group: string, method: string) => `${group}/${method}`;

  // Backend returns synchronously for SSE (SSESubscription) or async for HTTP
  const backend: ExecuteBackend = (group, method, variables, _options, raw) => {
    const key = mockKey(group, method);
    const handler = getMock(mocks, key);

    // SSE stream mock — return SSESubscription synchronously
    if (handler?.streamFn) {
      return handleStream(handler, group, method, variables, history);
    }
    // WS channel mock — return WSChannel synchronously
    if (handler?.channelHandlers) {
      return handleWSChannel(handler, group, method, variables, history);
    }

    // HTTP mock (or unmocked) — async flow, errors thrown as rejected Promise
    return handleHTTP(handler, { group, method, variables, raw }, history);
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

function handleStream(
  handler: MockHandler,
  group: string,
  method: string,
  variables: unknown,
  history: HistoryEntry[],
): unknown {
  const { streamFn, delayMs } = handler;
  if (!streamFn) return undefined;
  history.push({ group, method, variables, stream: true, timestamp: Date.now() });
  return createMockSSESubscription(streamFn, delayMs);
}

function handleWSChannel(
  handler: MockHandler,
  group: string,
  method: string,
  variables: unknown,
  history: HistoryEntry[],
): unknown {
  const { channelHandlers, delayMs } = handler;
  if (!channelHandlers) return undefined;
  history.push({ group, method, variables, channel: true, timestamp: Date.now() });
  return createMockWSChannel(channelHandlers, variables, delayMs);
}

interface MockCall {
  group: string;
  method: string;
  variables: unknown;
  /** Called through `.raw`, which resolves to the response around the data. */
  raw: boolean;
}

async function handleHTTP(
  handler: MockHandler | undefined,
  call: MockCall,
  history: HistoryEntry[],
): Promise<unknown> {
  const { group, method, variables } = call;
  const entry: HistoryEntry = { group, method, variables, timestamp: Date.now() };

  if (!handler) {
    const error = new Error(
      `[courier/testing] No mock for "${group}.${method}". ` +
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
  /* Typed as the real client, whose `.raw` resolves to the response around
     the data; handing back the bare data broke any read of its status. */
  return call.raw ? { status: handler.status, headers: new Headers(), data } : data;
}

function getMock(mocks: Map<string, MockHandler[]>, key: string): MockHandler | undefined {
  const handlers = mocks.get(key);
  const handler = handlers?.at(-1);
  if (!handlers || !handler) return undefined;

  if (handler.remaining !== undefined) {
    handler.remaining--;
    if (handler.remaining <= 0) handlers.pop();
  }

  return handler;
}
