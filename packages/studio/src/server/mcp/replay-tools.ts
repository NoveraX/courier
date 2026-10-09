import type { ServedTool } from "@noverax/courier-mcp/internal";

import { recordedRequests } from "./recorded-requests";
import { type PlannedReplay, type ReplayKind, type ReplayPlan, replayPlan } from "./replay-plan";
import { runReplay, type StudioReplays } from "./replay-run";
import { withoutSecrets } from "./without-secrets";

/* How much of the variables a confirmation shows a person. */
const SHOWN_VARIABLES = 600;

const ID_INPUT = {
  type: "object",
  properties: { id: { type: "string", description: "The request's id, from requests" } },
  required: ["id"],
  additionalProperties: false,
} as const;

const REPLAYED = {
  type: "object",
  properties: {
    id: { type: "string", description: "The new request's id, to read it in full with request" },
    replayed: { type: "string" },
    call: { type: "string" },
    status: { type: "integer" },
    durationMs: { type: "number" },
  },
  required: ["id", "replayed", "call", "status", "durationMs"],
} as const;

/**
 * The tool that sends a recorded read again — a query, as Studio's
 * inspector replays one — and answers with what came back now.
 *
 * @param deps - The request log, the router's runs, the bodies and the agent calls
 * @returns The tool
 * @example
 * ```ts
 * replayTool({ requestLog, run: router.run, wholeBody: wholeBodyOf, agentCalls }).run({ id: "req_7" }, caller);
 * ```
 */
export function replayTool(deps: StudioReplays): ServedTool {
  const tool: ServedTool = {
    name: "replay",
    title: "Replay a read",
    description:
      "Send a recorded read — a query, such as GET shop.products.list — again, as Studio's inspector replays it: by the runtime that made it, in the same mode, with the same variables, its middleware setting the headers afresh. Answers with what came back now: the new request's id (read it in full with request), its status, duration and answer. A write is refused here: replay_write sends one again once a person confirms it.",
    access: "read",
    idempotent: true,
    action: "replay a recorded read",
    inputSchema: ID_INPUT,
    outputSchema: REPLAYED,
    run: async (args, caller) => {
      const plan = planned(deps, args.id, "read");
      return "refusal" in plan
        ? { ok: false, message: plan.refusal }
        : runReplay(deps, plan, tool, caller);
    },
  };
  return tool;
}

/**
 * The tool that sends a recorded write again, once a person confirms it:
 * it does again what the request did. The person is shown the call and
 * the variables it sends.
 *
 * @param deps - The request log, the router's runs, the bodies and the agent calls
 * @returns The tool
 * @example
 * ```ts
 * replayWriteTool({ requestLog, run: router.run, wholeBody: wholeBodyOf, agentCalls });
 * ```
 */
export function replayWriteTool(deps: StudioReplays): ServedTool {
  const tool: ServedTool = {
    name: "replay_write",
    title: "Replay a write",
    description:
      "Send a recorded write — such as POST shop.orders.create — again, once a person confirms it: it does again what the request did, by the runtime that made it, with the same variables. Answers as replay does. A read is refused here: replay sends one without asking.",
    access: "destructive",
    idempotent: false,
    action: "replay a recorded write",
    inputSchema: ID_INPUT,
    outputSchema: REPLAYED,
    check: async (args) => {
      const plan = planned(deps, args.id, "write");
      return "refusal" in plan ? plan.refusal : undefined;
    },
    confirming: async (args) => {
      const plan = planned(deps, args.id, "write");
      return "refusal" in plan ? plan.refusal : shownWrite(plan);
    },
    run: async (args, caller) => {
      const plan = planned(deps, args.id, "write");
      return "refusal" in plan
        ? { ok: false, message: plan.refusal }
        : runReplay(deps, plan, tool, caller);
    },
  };
  return tool;
}

/* The request a tool replays, refused when it is of the other kind. */
function planned(deps: StudioReplays, id: unknown, kind: ReplayKind): ReplayPlan {
  const plan = replayPlan(recordedRequests(deps.requestLog), id);
  if ("refusal" in plan || plan.kind === kind) return plan;
  return {
    refusal:
      kind === "read"
        ? `${plan.request.id} is a write (${plan.call}): sending it again does it again — replay_write sends a write again once a person confirms it`
        : `${plan.request.id} is a read (${plan.call}): replay sends it again without asking anyone`,
  };
}

function shownWrite(plan: PlannedReplay): string {
  const { request } = plan;
  const shown = JSON.stringify(withoutSecrets(request.variables ?? {})) ?? "";
  const cut = shown.length > SHOWN_VARIABLES ? `${shown.slice(0, SHOWN_VARIABLES)}…` : shown;
  return `${plan.call} again, as request ${request.id} sent it, with ${cut}`;
}
