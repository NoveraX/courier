import type { ToolOutcome } from "@noverax/courier-mcp/internal";

import type { PlaygroundRunOutcome } from "../playground-run";
import { headersWithoutCredentials } from "../storage/without-credentials";
import type { PlannedReplay } from "./replay-plan";
import { withoutSecrets } from "./without-secrets";

/* The most of an answer handed back as data; a longer one comes back as the start of its JSON. */
const ANSWER_CHARS = 40_000;

/**
 * What an agent is told of a replay: the new request's id — to read it in
 * full with `request` — the call, its status and duration, its failure and
 * its answer, every credential's value and every field named like a secret
 * replaced. An answer too long to hand over whole comes back as the start
 * of its JSON, with its size. A replay that could not be sent says why.
 *
 * @param requestId - The id Studio records the new request under
 * @param plan - What was sent again
 * @param outcome - What the runtime answered
 * @returns The tool's outcome
 * @example
 * ```ts
 * return replayedOutcome("pg_7", plan, await router.run(call, signal));
 * ```
 */
export function replayedOutcome(
  requestId: string,
  plan: PlannedReplay,
  outcome: PlaygroundRunOutcome,
): ToolOutcome {
  if (!outcome.ok)
    return { ok: false, message: `${plan.call} was not sent again: ${outcome.message}` };
  const result = outcome.chunks.find((chunk) => chunk.kind === "http-result");
  if (result === undefined)
    return { ok: false, message: `${plan.call} ran, but its runtime sent back no result` };
  return {
    ok: true,
    data: {
      id: requestId,
      replayed: plan.request.id,
      call: plan.call,
      status: result.status,
      durationMs: Math.round(outcome.durationMs),
      ...(result.error !== undefined && { error: result.error }),
      ...answerOf(withoutSecrets(result.data)),
      ...(result.headers !== undefined && { headers: headersWithoutCredentials(result.headers) }),
    },
  };
}

function answerOf(data: unknown): Record<string, unknown> {
  if (data === undefined) return {};
  const json = JSON.stringify(data) ?? "";
  if (json.length <= ANSWER_CHARS) return { answer: data };
  return { answer: `${json.slice(0, ANSWER_CHARS)}…`, answerSize: Buffer.byteLength(json) };
}
