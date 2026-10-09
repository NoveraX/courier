import { type ServedTool, type ToolSet, toolSet } from "@noverax/courier-mcp/internal";

import type { RequestLog } from "../request-log";
import type { AgentCalls } from "./agent-calls";
import { auditTool, type StudioAuditInputs } from "./audit-tool";
import { mockScenarioTool, mocksTool, type StudioMocks } from "./mock-tools";
import type { StudioReplays } from "./replay-run";
import { replayTool, replayWriteTool } from "./replay-tools";
import { detailOf, gatherRequests, summaryOf } from "./request-views";

/** What Studio's tools read, run and change. */
export interface StudioToolDeps {
  readonly requestLog: Pick<RequestLog, "events">;
  readonly mocks: StudioMocks;
  /** Runs a replay in the app's runtime, with the whole variables when its record cut them. */
  readonly replays: Pick<StudioReplays, "run" | "wholeBody">;
  /** The requests Studio runs for an agent, whose records name it. */
  readonly agentCalls: AgentCalls;
  /** What the audit reads besides the requests. */
  readonly audit: Pick<StudioAuditInputs, "declared" | "runtimes">;
}

/**
 * Studio's views as an agent's tools: the requests it recorded, one of
 * them in full, its audit of them, the mocks it runs — and what an agent
 * may do: send a recorded read again, send a recorded write again once a
 * person confirms it, and switch a mock's scenario.
 *
 * @param deps - The request log, the mocks, the replays and the audit's inputs
 * @returns The tool set
 * @example
 * ```ts
 * const tools = studioTools({ requestLog, mocks: mockManager, replays, agentCalls, audit });
 * ```
 */
export function studioTools(deps: StudioToolDeps): ToolSet {
  const replays: StudioReplays = {
    ...deps.replays,
    requestLog: deps.requestLog,
    agentCalls: deps.agentCalls,
  };
  return toolSet([
    requestsTool(deps),
    requestTool(deps),
    auditTool({ ...deps.audit, requestLog: deps.requestLog }),
    replayTool(replays),
    replayWriteTool(replays),
    mocksTool(deps.mocks),
    mockScenarioTool(deps.mocks),
  ]);
}

function readTool(tool: Omit<ServedTool, "access" | "idempotent" | "action">): ServedTool {
  return { ...tool, access: "read", idempotent: true, action: `read ${tool.name}` };
}

function requestsTool({ requestLog }: StudioToolDeps): ServedTool {
  return readTool({
    name: "requests",
    title: "Recorded requests",
    description:
      "The requests Studio recorded from the running app, newest first: endpoint, method, mode, status, duration and error. Narrow them to the failed ones, to an endpoint, or to fewer.",
    inputSchema: {
      type: "object",
      properties: {
        failed: { type: "boolean", description: "Only requests that failed" },
        endpoint: {
          type: "string",
          description: "Only endpoints whose name holds this, such as orders.cancel",
        },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many, 20 by default" },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { requests: { type: "array", items: { type: "object" } } },
      required: ["requests"],
    },
    run: async (args) => {
      const limit =
        typeof args.limit === "number" ? Math.min(50, Math.max(1, Math.trunc(args.limit))) : 20;
      const wanted = typeof args.endpoint === "string" ? args.endpoint : undefined;
      const requests = [...gatherRequests(requestLog.events())]
        .map(([id, gathered]) => summaryOf(id, gathered))
        .filter(
          (request) =>
            (args.failed !== true || request.state === "error") &&
            (wanted === undefined || request.endpoint.includes(wanted)),
        )
        .slice(0, limit);
      return { ok: true, data: { requests } };
    },
  });
}

function requestTool({ requestLog }: StudioToolDeps): ServedTool {
  return readTool({
    name: "request",
    title: "One request in full",
    description:
      "One recorded request in full, by its id from requests: its variables, its answer, its headers, timing and failure. Credentials and fields named like secrets are replaced.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: async (args) => {
      const id = String(args.id);
      const gathered = gatherRequests(requestLog.events()).get(id);
      if (gathered === undefined)
        return { ok: false, message: `Studio has no request ${id}: list them with requests` };
      return { ok: true, data: detailOf(id, gathered) };
    },
  });
}
