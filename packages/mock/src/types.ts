import type { AnySource } from "@noverax/courier/define";
import type { ChannelHandlers, SSEEvent } from "@noverax/courier/realtime";

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

/** SSE stream generator stored in a handler */
export type MockStreamFn<TResponse = unknown, TVariables = unknown> = (
  ctx: MockRequestContext<TVariables>,
) => AsyncGenerator<SSEEvent<TResponse>, void, unknown>;

/** WS channel handler factory stored in a handler */
export type MockChannelFn<TResponse = unknown, TVariables = unknown> = (
  ctx: MockRequestContext<TVariables>,
) => ChannelHandlers<unknown, TResponse>;

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
  /** Transport type — undefined means standard HTTP */
  transport?: "sse" | "ws";
  /** SSE stream generator (set by .stream() / .emits()) */
  streamFn?: MockStreamFn;
  /** WS channel handler factory (set by .channel()) */
  channelFn?: MockChannelFn;
  /**
   * Set by `.sequence()`: gives each call its answer. The registry takes the
   * step as it resolves the call, so the step's status, error flag and delay
   * replace the handler's for that call alone.
   */
  nextStep?: () => SequenceStep;
}

/** The answer one entry of a response sequence gives the call that takes it */
export interface SequenceStep {
  data: unknown;
  isError: boolean;
  /** The entry's own status; unset, the handler's status applies */
  status?: number;
  /** The entry's own delay in ms; unset, the handler's delay applies */
  delayMs?: number;
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
  /** The share of this route's requests that fail, from 0 (none) to 1 (every one) */
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
  /** The share of requests that fail, from 0 (none) to 1 (every one); a failure takes one of `faultTypes` */
  errorRate?: number;
  /**
   * How long a `timeout` fault takes to fail, in ms. The mock server holds the
   * request this long (30 000 unless set), or until the client gives up, and
   * then answers 408, so a shorter client timeout fires first. The mock
   * client waits this long before it throws, and throws at once when unset.
   */
  timeout?: number;
  /**
   * The faults a failing request is given (default: 500 and 503). A status
   * fails with that status. `timeout` fails after `timeout` ms. `reset` drops
   * the connection on the mock server, so the client gets no answer at all;
   * the mock client throws a 502 for it.
   */
  faultTypes?: Array<"500" | "502" | "503" | "timeout" | "reset">;
  /** Weighted fault distribution — overrides faultTypes when present */
  faultWeights?: FaultWeight[];
  /** Per-route overrides — checked before global config */
  routeOverrides?: RouteNetworkOverride[];
  /** Latency distribution model (default: "uniform") */
  distribution?: LatencyDistribution;
  /**
   * Bandwidth in kilobits per second: an answer waits as long as its JSON body
   * takes to send at this rate, on top of the latency. 0 or unset is unlimited.
   */
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
  /** Whether this was a stream (SSE) request */
  stream?: boolean;
  /** Whether this was a channel (WS) request */
  channel?: boolean;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

/**
 * Type-only key naming the source a scenario was written for. It is declared
 * and never given a value, so no scenario object carries it.
 */
declare const SCENARIO_SOURCE: unique symbol;

/**
 * `mock` for a source whose endpoints the type system does not know: any group
 * and endpoint name is accepted, and the response and variables are `unknown`
 * unless named. Being generic in both, it stands in for the typed `mock` of
 * every source, which is how a server hands one `mock` to every scenario.
 */
export type UntypedMockFn = <TResponse = unknown, TVariables = unknown>(
  group: string,
  method: string,
) => EnhancedMockBuilder<TResponse, TVariables>;

/**
 * A scenario as a server holds and applies it, whatever source it was written
 * for. Every {@link MockScenario} is one.
 */
export interface AnyMockScenario {
  name: string;
  /** Short description shown in Studio Scenarios panel */
  description?: string;
  /** Tags for categorization in Studio (e.g. ["error", "latency", "auth"]) */
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
  /**
   * Sets the scenario's mocks up. The server calls it with a `mock` that takes
   * every address; `defineScenario` narrows that to the source's endpoints.
   */
  apply(mock: UntypedMockFn): void;
}

/**
 * Named scenario that configures multiple mocks at once, written for `TSource`.
 *
 * A scenario is accepted by a mock of its own source, or of a source that has
 * every endpoint it was written against, and rejected by any other. One
 * written without a source — `defineScenario` with no type argument, or a
 * plain object — is accepted by every mock.
 */
export interface MockScenario<in TSource extends AnySource = AnySource> extends AnyMockScenario {
  /** The source the scenario was written for, as a type; never present at runtime. */
  readonly [SCENARIO_SOURCE]?: (source: TSource) => void;
}

// ---------------------------------------------------------------------------
// Builder (interface — implementation in builder/)
// ---------------------------------------------------------------------------

/**
 * A single entry in a mock response sequence.
 *
 * - Plain value or `{ data }` → successful response, 200 unless `withStatus` set another
 * - `{ data, status?, delay? }` → that call alone answers with this status, after this delay (ms)
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
  /** Mock as SSE stream — provide async generator yielding SSEEvent<T> */
  stream(fn: MockStreamFn<TResponse, TVariables>): EnhancedMockBuilder<TResponse, TVariables>;
  /** Convenience: emit fixed SSE events in sequence, then close */
  emits(events: Array<SSEEvent<TResponse>>): EnhancedMockBuilder<TResponse, TVariables>;
  /** Mock as WS channel — provide channel handler factory */
  channel(fn: MockChannelFn<TResponse, TVariables>): EnhancedMockBuilder<TResponse, TVariables>;
}
