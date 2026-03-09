import type { Endpoint } from "../define/types";
import { HTTPError } from "../error";
import type { EndpointKey, RequestFn, ResolveEndpoint } from "../types";
import { parseEndpointKey } from "../utils/helpers";

// --- Exported Types ---

/** A recorded request in the test client history */
export type HistoryEntry = {
  source: string;
  endpoint: string;
  group?: string;
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

/** In-memory test client with mock support and request history */
export type TestClient<T extends Record<string, any> = Record<string, any>> = {
  /** Request function — same curried API as createRequest / createProxyRequest */
  request: RequestFn<T>;
  /** Mock a specific endpoint's response */
  mock: <K extends keyof T & string, Q extends EndpointKey<T[K]>>(
    source: K,
    endpoint: Q,
  ) => MockBuilder<ExtractEndpointResponse<ResolveEndpoint<T[K], Q>>>;
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
 * const { request, mock, history } = createTestClient<typeof sources>();
 *
 * mock("api", "users:getAll").resolves([{ id: "1", name: "Alice" }]);
 * const users = await request("api")("users:getAll");
 *
 * expect(users).toEqual([{ id: "1", name: "Alice" }]);
 * expect(history).toHaveLength(1);
 */
export function createTestClient<T extends Record<string, any> = Record<string, any>>(
  _sources?: Record<string, any>,
): TestClient<T> {
  const mocks = new Map<string, MockHandler[]>();
  const history: HistoryEntry[] = [];

  const mockKey = (source: string, endpoint: string) => `${source}/${endpoint}`;

  function getMock(source: string, endpoint: string): MockHandler | undefined {
    const handlers = mocks.get(mockKey(source, endpoint));
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

  const request = ((source: string) => {
    return async (endpoint: string, variables?: unknown) => {
      const { group, method } = parseEndpointKey(endpoint);
      const handler = getMock(source, endpoint);

      const entry: HistoryEntry = {
        source,
        endpoint,
        group,
        method,
        variables,
        timestamp: Date.now(),
      };

      if (!handler) {
        const error = new Error(
          `[nexus/testing] No mock for "${source}" > "${endpoint}". ` +
            `Call mock("${source}", "${endpoint}").resolves(data) first.`,
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
  }) as unknown as RequestFn<T>;

  function mock(source: string, endpoint: string): MockBuilder<unknown> {
    const k = mockKey(source, endpoint);
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
    request,
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

/** Filter history entries by source and optionally by endpoint */
export function findRequests(
  history: HistoryEntry[],
  source: string,
  endpoint?: string,
): HistoryEntry[] {
  return history.filter(
    (e) => e.source === source && (endpoint === undefined || e.endpoint === endpoint),
  );
}
