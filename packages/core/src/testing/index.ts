import { buildClientProxy, type ExecuteBackend, type TypedClient } from "../client";
import type { DefinedApi, Endpoint } from "../define/types";
import { HTTPError } from "../error";

// --- Exported Types ---

/** A recorded request in the test client history */
export type HistoryEntry = {
  group: string;
  method: string;
  variables?: unknown;
  result?: { status: number; data: unknown };
  error?: Error;
  timestamp: number;
};

/** Fluent builder for configuring endpoint mocks */
export type MockBuilder<R = unknown> = {
  /** Return static data on success (status 200) */
  resolves(data: R): MockBuilder<R>;
  /** Return dynamic data based on variables */
  returns(fn: (variables?: unknown) => R | Promise<R>): MockBuilder<R>;
  /** Throw HTTPError with given status and optional data */
  rejects(status: number, data?: unknown): MockBuilder<R>;
  /** Limit mock to a single invocation */
  once(): MockBuilder<R>;
  /** Limit mock to N invocations */
  times(n: number): MockBuilder<R>;
  /** Add artificial delay (ms) before responding */
  delay(ms: number): MockBuilder<R>;
};

type ExtractEndpointResponse<M> = M extends Endpoint<infer R, any> ? R : unknown;

type ApiGroups<T extends DefinedApi<any>> = T["options"]["groups"];

/** In-memory test client with mock support and request history */
export type TestClient<T extends DefinedApi<any> = DefinedApi<any>> = {
  /** Typed client — same dot-notation API as createCaller / createProxyCaller */
  client: TypedClient<T>;
  /** Mock a specific endpoint's response */
  mock: <
    G extends keyof ApiGroups<T> & string,
    M extends Exclude<keyof ApiGroups<T>[G], "options"> & string,
  >(
    group: G,
    method: M,
  ) => MockBuilder<ExtractEndpointResponse<ApiGroups<T>[G][M]>>;
  /** Array of all recorded requests */
  history: HistoryEntry[];
  /** Clear all mocks and history */
  reset(): void;
  /** Clear only mocks */
  resetMocks(): void;
  /** Clear only history */
  resetHistory(): void;
};

// --- Internal ---

type MockHandler = {
  resolver?: (variables?: unknown) => unknown | Promise<unknown>;
  data?: unknown;
  status: number;
  isError: boolean;
  remaining?: number;
  delayMs?: number;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --- Public API ---

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

  function getMock(group: string, method: string): MockHandler | undefined {
    const handlers = mocks.get(mockKey(group, method));
    if (!handlers?.length) return undefined;

    // Stack: latest mock wins, consumed mocks are popped
    const handler = handlers[handlers.length - 1]!;

    if (handler.remaining !== undefined) {
      handler.remaining--;
      if (handler.remaining <= 0) {
        handlers.pop();
      }
    }

    return handler;
  }

  const backend: ExecuteBackend = async (group, method, variables, _options, _raw) => {
    const handler = getMock(group, method);

    const entry: HistoryEntry = {
      group,
      method,
      variables,
      timestamp: Date.now(),
    };

    if (!handler) {
      const error = new Error(
        `[nexus/testing] No mock for "${group}.${method}". ` +
          `Call mock("${group}", "${method}").resolves(data) first.`,
      );
      entry.error = error;
      history.push(entry);
      throw error;
    }

    if (handler.delayMs) {
      await sleep(handler.delayMs);
    }

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
    mocks.get(k)!.push(handler);

    const builder: MockBuilder<unknown> = {
      resolves(data: unknown) {
        handler.data = data;
        handler.isError = false;
        handler.resolver = undefined;
        return builder;
      },
      returns(fn: (variables?: unknown) => unknown | Promise<unknown>) {
        handler.resolver = fn;
        handler.isError = false;
        handler.data = undefined;
        return builder;
      },
      rejects(status: number, data?: unknown) {
        handler.status = status;
        handler.data = data ?? { success: false, message: `HTTP ${status}` };
        handler.isError = true;
        handler.resolver = undefined;
        return builder;
      },
      once() {
        handler.remaining = 1;
        return builder;
      },
      times(n: number) {
        handler.remaining = n;
        return builder;
      },
      delay(ms: number) {
        handler.delayMs = ms;
        return builder;
      },
    };

    return builder;
  }

  return {
    client: buildClientProxy<T>(backend),
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

/** Filter history entries by group and optionally by method */
export function findRequests(
  history: HistoryEntry[],
  group: string,
  method?: string,
): HistoryEntry[] {
  return history.filter((e) => e.group === group && (method === undefined || e.method === method));
}
