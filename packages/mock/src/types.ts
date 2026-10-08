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

/**
 * WS channel handler factory stored in a handler: the handlers it returns
 * receive each message a client sends as the endpoint's `send` type.
 */
export type MockChannelFn<TResponse = unknown, TVariables = unknown, TSend = unknown> = (
  ctx: MockRequestContext<TVariables>,
) => ChannelHandlers<TSend, TResponse>;

/** Resolved handler stored in the registry */
export interface ResolvedHandler {
  fn: MockHandlerFn;
  status: number;
  headers?: Record<string, string> | undefined;
  delayMs?: number | undefined;
  latency?: LatencyProfile | undefined;
  isError: boolean;
  remaining?: number | undefined;
  requiredState?: string | undefined;
  newState?: string | undefined;
  /** Transport type — undefined means standard HTTP */
  transport?: "sse" | "ws" | undefined;
  /** SSE stream generator (set by .stream() / .emits()) */
  streamFn?: MockStreamFn | undefined;
  /** WS channel handler factory (set by .channel()) */
  channelFn?: MockChannelFn | undefined;
  /**
   * Set by `.sequence()`: gives each call its answer. The registry takes the
   * step as it resolves the call, so the step's status, error flag and delay
   * replace the handler's for that call alone.
   */
  nextStep?: (() => SequenceStep) | undefined;
}

/** The answer one entry of a response sequence gives the call that takes it */
export interface SequenceStep {
  data: unknown;
  isError: boolean;
  /** The entry's own status; unset, the handler's status applies */
  status?: number | undefined;
  /** The entry's own delay in ms; unset, the handler's delay applies */
  delayMs?: number | undefined;
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
  | { min: number; max: number; jitter?: number | undefined };

/**
 * A fault a failing request is given: an error status it is answered with
 * at once (`"413"`, `"429"`, `"503"` — any from 400 to 599), or a fault of
 * its connection — `timeout`, `reset`, or `interrupt` for an upload cut off
 * partway.
 */
export type FaultType = `4${number}` | `5${number}` | "timeout" | "reset" | "interrupt";

/** Weighted fault entry — weight is 0–100, normalized at selection time */
export interface FaultWeight {
  type: string;
  weight: number;
}

/**
 * How the mock takes uploads: how fast request bodies arrive, and which
 * uploads it refuses as a server with limits does.
 */
export interface UploadConditions {
  /**
   * How fast request bodies arrive, in kilobits a second — a form, a file or
   * JSON alike: the mock reads a body no faster, so the client's upload
   * progress moves as it would on a slow link. 0 or unset is unlimited.
   */
  bandwidth?: number | undefined;
  /**
   * The largest upload the mock takes, in bytes: a form or a file body over
   * it is answered 413 before it is read. It cannot raise the mock's
   * `maxUploadBytes`, the most it ever reads.
   */
  maxBytes?: number | undefined;
  /**
   * The types of file the mock takes, as an `<input accept>` lists them — a
   * type (`"application/pdf"`), a family (`"image/*"`) or an extension
   * (`".csv"`). An upload holding a file of another type is answered 415.
   * Unset or empty takes any.
   */
  accept?: string[] | undefined;
}

/**
 * A route's own network settings, each in place of the global one; a
 * setting it leaves unset stays the global one. An error rate of 0 keeps
 * the route from failing whatever the global rate — Down included.
 */
export interface RouteNetworkOverride {
  /** "group:endpoint" key */
  routeId: string;
  /** Whether the route takes its settings now; switched off, it keeps them and takes the global ones */
  enabled: boolean;
  latency?: { min: number; max: number; jitter?: number | undefined } | undefined;
  /** The share of this route's requests that fail, from 0 (none) to 1 (every one) */
  errorRate?: number | undefined;
  /** The faults this route's failures take, each as likely, in place of the global mix */
  faultTypes?: FaultType[] | undefined;
  /** The largest upload this route takes and the types of file, each in place of the global one */
  uploads?: Omit<UploadConditions, "bandwidth"> | undefined;
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
  latency?: number | LatencyProfile | undefined;
  /** The share of requests that fail, from 0 (none) to 1 (every one); a failure takes one of `faultTypes` */
  errorRate?: number | undefined;
  /**
   * How long a `timeout` fault takes to fail, in ms. The mock server holds the
   * request this long (30 000 unless set), or until the client gives up, and
   * then answers 408, so a shorter client timeout fires first. The mock
   * client waits this long before it throws, and throws at once when unset.
   */
  timeout?: number | undefined;
  /**
   * The faults a failing request is given (default: 500 and 503). A status
   * fails with that status, its reason phrase in the body. `timeout` fails
   * after `timeout` ms. `reset` drops the connection on the mock server, so
   * the client gets no answer at all, and `interrupt` drops it once half the
   * request's body has arrived, so an upload fails partway; the mock client
   * throws a 502 for either.
   */
  faultTypes?: FaultType[] | undefined;
  /** Weighted fault distribution — overrides faultTypes when present */
  faultWeights?: FaultWeight[] | undefined;
  /** Each route's own settings, on or off; an enabled one takes the place of the global ones it sets */
  routeOverrides?: RouteNetworkOverride[] | undefined;
  /** Latency distribution model (default: "uniform") */
  distribution?: LatencyDistribution | undefined;
  /**
   * Bandwidth in kilobits per second: an answer waits as long as its JSON body
   * takes to send at this rate, on top of the latency. 0 or unset is unlimited.
   */
  bandwidth?: number | undefined;
  /** How fast request bodies arrive, and the largest upload and the types of file the mock takes */
  uploads?: UploadConditions | undefined;
  /** Stop conditions for auto-halting */
  stopConditions?: StopCondition | undefined;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** A recorded request in the mock client history */
export interface MockHistoryEntry {
  group: string;
  method: string;
  variables?: unknown;
  result?:
    | { status: number; data: unknown; headers?: Record<string, string> | undefined }
    | undefined;
  error?: Error | undefined;
  duration: number;
  timestamp: number;
  mocked: boolean;
  /** Whether this was a stream (SSE) request */
  stream?: boolean | undefined;
  /** Whether this was a channel (WS) request */
  channel?: boolean | undefined;
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
export type UntypedMockFn = <TResponse = unknown, TVariables = unknown, TSend = unknown>(
  group: string,
  method: string,
) => EnhancedMockBuilder<TResponse, TVariables, TSend>;

/**
 * A scenario as a server holds and applies it, whatever source it was written
 * for. Every {@link MockScenario} is one.
 */
export interface AnyMockScenario {
  name: string;
  /** Short description shown in Studio Scenarios panel */
  description?: string | undefined;
  /** Tags for categorization in Studio (e.g. ["error", "latency", "auth"]) */
  tags?: string[] | undefined;
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
  initialState?: string | undefined;
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
  | { data: TResponse; status?: number | undefined; delay?: number | undefined }
  | { error: true; status: number; data?: unknown };

/** Fluent builder for configuring endpoint mocks */
export interface EnhancedMockBuilder<TResponse = unknown, TVariables = unknown, TSend = unknown> {
  /** Return static data on success (status 200) */
  resolves(data: TResponse): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Return dynamic data based on request context */
  returns(
    fn: MockHandlerFn<TResponse, TVariables>,
  ): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Throw HTTPError with given status and optional data */
  rejects(status: number, data?: unknown): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Limit mock to a single invocation */
  once(): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Limit mock to N invocations */
  times(n: number): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Add artificial delay (ms) before responding */
  delay(ms: number): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Respond with a latency profile (3g, 4g, wifi, fiber, or custom) */
  withLatency(profile: LatencyProfile): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Add custom response headers */
  withHeaders(headers: Record<string, string>): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Set custom HTTP status code */
  withStatus(status: number): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Only match when scenario is in this state (WireMock-style) */
  inState(state: string): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Transition scenario to new state after response (WireMock-style) */
  transitionTo(state: string): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /**
   * Ordered sequence of responses — success, error, or mixed.
   * Last entry repeats indefinitely once reached.
   */
  sequence(
    responses: Array<SequenceEntry<TResponse>>,
  ): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Mock as SSE stream — provide async generator yielding SSEEvent<T> */
  stream(
    fn: MockStreamFn<TResponse, TVariables>,
  ): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Convenience: emit fixed SSE events in sequence, then close */
  emits(events: Array<SSEEvent<TResponse>>): EnhancedMockBuilder<TResponse, TVariables, TSend>;
  /** Mock as WS channel — provide channel handler factory */
  channel(
    fn: MockChannelFn<TResponse, TVariables, TSend>,
  ): EnhancedMockBuilder<TResponse, TVariables, TSend>;
}
