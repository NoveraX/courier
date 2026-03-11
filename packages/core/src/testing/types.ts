import type { TypedClient } from "../client";
import type { DefinedApi, Endpoint } from "../define/types";

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

export type ExtractEndpointResponse<M> = M extends Endpoint<infer R, any> ? R : unknown;

export type ApiGroups<T extends DefinedApi<any>> = T["options"]["groups"];

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
