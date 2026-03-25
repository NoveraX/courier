import type { DefinedApi, Endpoint } from "@noverax/nexus/define";

/** Extract response type from an endpoint */
export type ExtractResponse<TEndpoint> =
  TEndpoint extends Endpoint<infer TResponse, any> ? TResponse : unknown;

/** Extract variables type from an endpoint */
export type ExtractVariables<TEndpoint> =
  TEndpoint extends Endpoint<any, infer TVariables> ? TVariables : unknown;

/** Extract groups from a DefinedApi */
export type ApiGroups<TApi extends DefinedApi<any>> = TApi["options"]["groups"];

/** Extract endpoint method keys from a group (excludes "options") */
export type EndpointKeys<TGroup> = Exclude<keyof TGroup, "options"> & string;

// ---------------------------------------------------------------------------
// Mock handler
// ---------------------------------------------------------------------------

/** Context passed to mock handler functions */
export interface MockRequestContext<TVariables = unknown> {
  variables: TVariables;
  headers: Headers;
  /** How many times this specific endpoint has been called (0-indexed) */
  callIndex: number;
  /** Current scenario state (WireMock-style) */
  scenarioState: string;
}

/** Function that produces a response for a mocked endpoint */
export type MockHandlerFn<TResponse = unknown, TVariables = unknown> = (
  ctx: MockRequestContext<TVariables>,
) => TResponse | Promise<TResponse>;

/** Resolved handler stored in the registry */
export interface ResolvedHandler {
  fn: MockHandlerFn;
  status: number;
  headers?: Record<string, string>;
  delayMs?: number;
  latency?: LatencyProfile;
  isError: boolean;
  remaining?: number;
  requiredState?: string;
  newState?: string;
}

// ---------------------------------------------------------------------------
// Network simulation
// ---------------------------------------------------------------------------

/** Named latency profiles or custom range */
export type LatencyProfile =
  | "3g"
  | "4g"
  | "wifi"
  | "fiber"
  | { min: number; max: number; jitter?: number };

/** Weighted fault entry — weight is 0–100, normalized at selection time */
export interface FaultWeight {
  type: string;
  weight: number;
}

/** Per-route network override */
export interface RouteNetworkOverride {
  /** "group:endpoint" key */
  routeId: string;
  enabled: boolean;
  latency?: { min: number; max: number; jitter?: number };
  errorRate?: number;
  faultTypes?: string[];
}

/** Latency distribution model */
export type LatencyDistribution = "uniform" | "normal" | "log-normal";

/** Stop condition for auto-halting fault injection */
export interface StopCondition {
  enabled: boolean;
  errorRateThreshold: number;
  errorRateDurationSecs: number;
  p99Threshold: number;
  p99DurationSecs: number;
  maxDurationMins: number;
}

/** Network simulation configuration */
export interface NetworkConfig {
  latency?: number | LatencyProfile;
  errorRate?: number;
  timeout?: number;
  faultTypes?: Array<"500" | "502" | "503" | "timeout" | "reset">;
  /** Weighted fault distribution — overrides faultTypes when present */
  faultWeights?: FaultWeight[];
  /** Per-route overrides — checked before global config */
  routeOverrides?: RouteNetworkOverride[];
  /** Latency distribution model (default: "uniform") */
  distribution?: LatencyDistribution;
  /** Bandwidth cap in Kbps (0 = unlimited) — reserved for future use */
  bandwidth?: number;
  /** Stop conditions for auto-halting */
  stopConditions?: StopCondition;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** A recorded request in the mock client history */
export interface MockHistoryEntry {
  group: string;
  method: string;
  variables?: unknown;
  result?: { status: number; data: unknown; headers?: Record<string, string> };
  error?: Error;
  duration: number;
  timestamp: number;
  mocked: boolean;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

/** Named scenario that configures multiple mocks at once */
export interface MockScenario<TApi extends DefinedApi<any> = DefinedApi<any>> {
  name: string;
  /** Short description shown in DevTools Scenarios panel */
  description?: string;
  /** Tags for categorization in DevTools (e.g. ["error", "latency", "auth"]) */
  tags?: string[];
  /**
   * Initial scenario state when this scenario is applied.
   * Defaults to "Started" if omitted.
   * Use for state-machine scenarios (WireMock-style).
   *
   * @example
   * ```ts
   * { name: "auth-flow", initialState: "unauthorized", apply(mock) { ... } }
   * ```
   */
  initialState?: string;
  apply(mock: TypedMockFn<TApi>): void;
}

/** Type-safe mock function — constrains group/method to actual API endpoints */
export type TypedMockFn<TApi extends DefinedApi<any>> = <
  TGroup extends keyof ApiGroups<TApi> & string,
  TMethod extends EndpointKeys<ApiGroups<TApi>[TGroup]>,
>(
  group: TGroup,
  method: TMethod,
) => EnhancedMockBuilder<
  ExtractResponse<ApiGroups<TApi>[TGroup][TMethod]>,
  ExtractVariables<ApiGroups<TApi>[TGroup][TMethod]>
>;

// ---------------------------------------------------------------------------
// Builder (interface — implementation in builder/)
// ---------------------------------------------------------------------------

/**
 * A single entry in a mock response sequence.
 *
 * - Plain value or `{ data }` → successful 200 response
 * - `{ error: true, status, data? }` → error response with given status
 *
 * @example
 * ```ts
 * mock("pets", "listPets").sequence([
 *   { data: [{ id: "1", name: "Buddy" }] },
 *   { error: true, status: 500, data: { message: "Connection reset" } },
 * ]);
 * ```
 */
export type SequenceEntry<TResponse> =
  | TResponse
  | { data: TResponse; status?: number; delay?: number }
  | { error: true; status: number; data?: unknown };

/** Fluent builder for configuring endpoint mocks */
export interface EnhancedMockBuilder<TResponse = unknown, TVariables = unknown> {
  /** Return static data on success (status 200) */
  resolves(data: TResponse): EnhancedMockBuilder<TResponse, TVariables>;
  /** Return dynamic data based on request context */
  returns(fn: MockHandlerFn<TResponse, TVariables>): EnhancedMockBuilder<TResponse, TVariables>;
  /** Throw HTTPError with given status and optional data */
  rejects(status: number, data?: unknown): EnhancedMockBuilder<TResponse, TVariables>;
  /** Limit mock to a single invocation */
  once(): EnhancedMockBuilder<TResponse, TVariables>;
  /** Limit mock to N invocations */
  times(n: number): EnhancedMockBuilder<TResponse, TVariables>;
  /** Add artificial delay (ms) before responding */
  delay(ms: number): EnhancedMockBuilder<TResponse, TVariables>;
  /** Respond with a latency profile (3g, 4g, wifi, fiber, or custom) */
  withLatency(profile: LatencyProfile): EnhancedMockBuilder<TResponse, TVariables>;
  /** Add custom response headers */
  withHeaders(headers: Record<string, string>): EnhancedMockBuilder<TResponse, TVariables>;
  /** Set custom HTTP status code */
  withStatus(status: number): EnhancedMockBuilder<TResponse, TVariables>;
  /** Only match when scenario is in this state (WireMock-style) */
  inState(state: string): EnhancedMockBuilder<TResponse, TVariables>;
  /** Transition scenario to new state after response (WireMock-style) */
  transitionTo(state: string): EnhancedMockBuilder<TResponse, TVariables>;
  /**
   * Ordered sequence of responses — success, error, or mixed.
   * Last entry repeats indefinitely once reached.
   */
  sequence(responses: Array<SequenceEntry<TResponse>>): EnhancedMockBuilder<TResponse, TVariables>;
}
