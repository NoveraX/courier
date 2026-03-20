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
export type MockBuilder<TResponse = unknown> = {
  /** Return static data on success (status 200) */
  resolves(data: TResponse): MockBuilder<TResponse>;
  /** Return dynamic data based on variables */
  returns(fn: (variables?: unknown) => TResponse | Promise<TResponse>): MockBuilder<TResponse>;
  /** Throw HTTPError with given status and optional data */
  rejects(status: number, data?: unknown): MockBuilder<TResponse>;
  /** Limit mock to a single invocation */
  once(): MockBuilder<TResponse>;
  /** Limit mock to N invocations */
  times(n: number): MockBuilder<TResponse>;
  /** Add artificial delay (ms) before responding */
  delay(ms: number): MockBuilder<TResponse>;
};

export type ExtractEndpointResponse<TEndpoint> =
  TEndpoint extends Endpoint<infer TResponse, any> ? TResponse : unknown;

export type ApiGroups<TApi extends DefinedApi<any>> = TApi["options"]["groups"];

/** In-memory test client with mock support and request history */
export type TestClient<TApi extends DefinedApi<any> = DefinedApi<any>> = {
  /** Typed client — same dot-notation API as createCaller / createProxyCaller */
  client: TypedClient<TApi>;
  /** Mock a specific endpoint's response */
  mock: <
    TGroup extends keyof ApiGroups<TApi> & string,
    TMethod extends Exclude<keyof ApiGroups<TApi>[TGroup], "options"> & string,
  >(
    group: TGroup,
    method: TMethod,
  ) => MockBuilder<ExtractEndpointResponse<ApiGroups<TApi>[TGroup][TMethod]>>;
  /** Array of all recorded requests */
  history: HistoryEntry[];
  /** Clear all mocks and history */
  reset(): void;
  /** Clear only mocks */
  resetMocks(): void;
  /** Clear only history */
  resetHistory(): void;
};
