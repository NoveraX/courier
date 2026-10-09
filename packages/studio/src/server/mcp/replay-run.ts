import { randomUUID } from "node:crypto";
import type { ServedTool, ToolCaller, ToolOutcome } from "@noverax/courier-mcp/internal";
import type { RequestAgent } from "@noverax/courier-studio-core";
import { playgroundRequestId } from "@noverax/courier-studio-core";

import type { PlaygroundRunOutcome } from "../playground-run";
import type { RequestLog } from "../request-log";
import { type PlaygroundExecPayload, sanitizeExec } from "../runtime-playground-router-sanitize";
import type { Asked, BodyAnswer } from "../ui-bodies";
import type { AgentCalls } from "./agent-calls";
import { replayedOutcome } from "./replay-outcome";
import type { PlannedReplay } from "./replay-plan";

/** What Studio's replays read and run. */
export interface StudioReplays {
  readonly requestLog: Pick<RequestLog, "events">;
  /** Runs a call in the app's runtime for Studio itself. */
  readonly run: (
    call: PlaygroundExecPayload,
    signal?: AbortSignal,
  ) => Promise<PlaygroundRunOutcome>;
  /** A request's whole body, from the runtime that made it. */
  readonly wholeBody: (asked: Asked) => Promise<BodyAnswer>;
  readonly agentCalls: AgentCalls;
}

/**
 * Send a recorded request again for an agent, as the inspector's Replay
 * does: by the runtime that made it, in the same mode, with its variables
 * — whole, even when its record cut them — and the headers set afresh by
 * the app's middleware. The new request's record names the agent and its
 * client.
 *
 * @param deps - The router's runs, the bodies and the agent calls
 * @param plan - What is sent again
 * @param tool - The tool the agent called
 * @param caller - Who called it, and when to stop
 * @returns What came back, as the agent is told it
 * @example
 * ```ts
 * return runReplay(deps, plan, tool, caller);
 * ```
 */
export async function runReplay(
  deps: StudioReplays,
  plan: PlannedReplay,
  tool: ServedTool,
  caller: ToolCaller,
): Promise<ToolOutcome> {
  const { request } = plan;
  const variables = await variablesOf(deps, plan);
  if ("refusal" in variables) return { ok: false, message: variables.refusal };
  const rid = randomUUID();
  const call = sanitizeExec({
    rid,
    source: request.source,
    group: request.group ?? "",
    method: request.method,
    mode: request.mode,
    transport: "http",
    variables: variables.value,
    headers: {},
    runtimeId: request.callerRuntimeId ?? request.sessionId,
  });
  if (call === null)
    return { ok: false, message: `${request.id}'s variables hold a key no call may carry` };
  const requestId = playgroundRequestId(rid);
  deps.agentCalls.expect(requestId, agentOf(tool, caller));
  try {
    return replayedOutcome(requestId, plan, await deps.run(call, caller.signal));
  } finally {
    deps.agentCalls.forget(requestId);
  }
}

/* Whole, even when the request's event carried a part of them: a replay never sends a part for the whole. */
async function variablesOf(
  deps: StudioReplays,
  { request }: PlannedReplay,
): Promise<{ value: unknown } | { refusal: string }> {
  if (request.variablesCutFrom === undefined) return { value: request.variables ?? {} };
  const body = await deps.wholeBody({
    owner: request.sessionId,
    requestId: request.id,
    part: "request",
  });
  const unsent = `${request.id} was not sent again: its variables were too large for Studio's record of it`;
  if (!body.ok)
    return {
      refusal: `${unsent}, and the app that made it did not hand them over whole (${body.error})`,
    };
  try {
    return { value: JSON.parse(body.data) };
  } catch {
    return { refusal: `${unsent}, and the app that made it did not send them back as JSON` };
  }
}

function agentOf(tool: ServedTool, caller: ToolCaller): RequestAgent {
  const client =
    caller.client && [caller.client.name, caller.client.version].filter(Boolean).join(" ");
  return { tool: tool.name, access: tool.access, ...(client && { client }) };
}
