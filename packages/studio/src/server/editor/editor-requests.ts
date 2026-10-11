import { gatherRequests, summaryOf } from "../mcp/request-views";

type RuntimeEvent = Record<string, unknown>;

/** A recorded request, as an editor lists it. */
export interface EditorRequest {
  readonly id: string;
  readonly source: string;
  /** Its call in the client: `orders.place` */
  readonly endpoint: string;
  readonly method?: string | undefined;
  readonly mode: string;
  readonly state: "success" | "error" | "pending";
  readonly status?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly startedAt: number;
  readonly error?: string | undefined;
}

/** Which requests an editor asks for. */
export interface RequestsWanted {
  readonly failed?: boolean | undefined;
  readonly source?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly limit?: number | undefined;
}

/* An editor lists what fits a sidebar; Studio's Timeline holds the rest. */
const MOST = 100;

/**
 * The requests Studio recorded, newest first, as an editor lists them — the
 * failed ones alone, or one endpoint's, when asked — each with its source
 * and its call in the client apart, its status, duration and failure.
 *
 * @param events - The request log's events
 * @param wanted - Which requests, and how many: 50 by default, 100 at most
 * @returns The requests
 * @example
 * ```ts
 * editorRequests(requestLog.events(), { failed: true, limit: 20 });
 * ```
 */
export function editorRequests(
  events: readonly RuntimeEvent[],
  wanted: RequestsWanted = {},
): EditorRequest[] {
  const limit = Math.min(MOST, Math.max(1, Math.trunc(wanted.limit ?? 50)));
  const found: EditorRequest[] = [];
  for (const [id, gathered] of gatherRequests(events)) {
    const { start } = gathered;
    if (start.mode === "webhook") continue;
    const source = String(start.source ?? "");
    const endpoint = [start.group, start.method]
      .filter((part) => typeof part === "string" && part !== "")
      .join(".");
    const { endpoint: _named, agent: _agent, ...summary } = summaryOf(id, gathered);
    if (wanted.failed === true && summary.state !== "error") continue;
    if (wanted.source !== undefined && wanted.source !== source) continue;
    if (wanted.endpoint !== undefined && wanted.endpoint !== endpoint) continue;
    found.push({ ...summary, source, endpoint });
    if (found.length >= limit) break;
  }
  return found;
}
