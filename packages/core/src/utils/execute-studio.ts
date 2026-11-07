import type { AgentCall } from "../agent/types";
import { studioCapability } from "../capabilities/registry";
import type { StudioCapability } from "../capabilities/studio";
import { NO_HOOKS } from "../capabilities/studio-hooks";
import type { Context } from "../http-client/types";
import type { CallPurpose } from "../middleware/types";
import type { StudioHooks } from "../studio/hooks";
import type { SchemaMetadata } from "../validation";
import type { SharedAnswer } from "./shared-answer";

export type TimingState = {
  t0: number;
  tVarValidation: number;
  tRespValidation: number;
  tFetch: number;
  /** How the call's read was answered by another call's request, when it was */
  shared?: SharedAnswer | undefined;
  /** Whether this attempt's request was sent: one refused before then made no fetch */
  sent?: boolean | undefined;
};

/** Whether Studio listens to a call, and how it is told: the server's report, its hooks, the call's id. */
export type StudioContext = {
  hasStudio: boolean;
  /** Studio's report on the call; absent where its runtime is not attached */
  report: StudioCapability | undefined;
  requestId: string;
  dt: StudioHooks;
};

/** What a request is, as Studio is told when it starts. */
export interface RequestStart {
  source: unknown;
  group: unknown;
  method: unknown;
  variables: unknown;
  mode: "direct" | "proxy";
  middlewareCount: number;
  schema: SchemaMetadata | undefined;
  /** The endpoint's HTTP verb, when it declares one. */
  httpMethod: string | undefined;
  /** What the call is, when it is a request the session makes rather than an endpoint's */
  purpose?: CallPurpose | undefined;
  /** The agent the call comes from, when an MCP server made it for one */
  agent?: AgentCall | undefined;
  /** The key the call sends in its endpoint's idempotency header, the same on every attempt */
  idempotencyKey?: string | undefined;
}

/** How Studio knows a call a failure ends: its id, its hooks, and what it measured of it. */
export interface FailureReport {
  requestId: string;
  dt: Partial<StudioHooks>;
  /** The server's report, which builds what Studio is told; absent while Studio is not attached */
  report?: StudioCapability | undefined;
  /** The call's timings, when it got as far as sending its request */
  timing?: TimingState | undefined;
  /** How many middleware the call ran through */
  middlewareCount?: number | undefined;
  /** The call's own signal: a failure it aborted with is a cancellation */
  signal?: AbortSignal | undefined;
  /** The call's context: a caller that left makes the failure a cancellation */
  context?: Context | undefined;
}

/**
 * What a call is measured and told to Studio with: the id its events carry,
 * a new one unless the proxy gave it one, and its timings. Where Studio's
 * runtime is not attached — a page that runs none — nothing is measured.
 *
 * @param requestId - The id the proxy gave the call, if it did
 * @returns The call's Studio context and timing
 * @example
 * ```ts
 * const { studio, timing } = callInstruments(context?.studioRequestId);
 * ```
 */
export function callInstruments(requestId: string | undefined): {
  studio: StudioContext;
  timing: TimingState;
} {
  const report = studioCapability();
  const timing = { t0: 0, tVarValidation: 0, tRespValidation: 0, tFetch: 0 };
  if (report === undefined || report.hooks.onRequestStart === undefined) {
    return {
      studio: { hasStudio: false, report, requestId: "", dt: report?.hooks ?? NO_HOOKS },
      timing,
    };
  }
  return {
    studio: {
      hasStudio: true,
      report,
      requestId: requestId ?? report.requestId(),
      dt: report.hooks,
    },
    timing: { ...timing, t0: performance.now() },
  };
}
