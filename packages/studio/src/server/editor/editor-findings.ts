import { runAudit } from "@/features/audit/run-audit";
import type { AuditEndpoint, AuditItem } from "@/features/audit/types";
import { buildCatalog } from "@/store/build-catalog";
import type { RequestEntry } from "@/store/types-request";
import type { StudioAuditInputs } from "../mcp/audit-tool";
import { recordedRequests } from "../mcp/recorded-requests";

/** An endpoint a finding concerns, as a call in the code names it. */
export interface FindingEndpoint {
  readonly source: string;
  /** Its call in the client: `orders.place` */
  readonly endpoint: string;
  /** What was seen at it: `p95 1.8 s across 40 calls` */
  readonly detail?: string;
}

/** A finding of Studio's audit, as an editor shows it at the calls it concerns. */
export interface EditorFinding {
  readonly id: string;
  readonly severity: "error" | "warning" | "hint";
  readonly category: AuditItem["category"];
  readonly title: string;
  readonly description: string;
  readonly suggestion?: string;
  readonly endpoints: readonly FindingEndpoint[];
}

/**
 * Studio's audit of the requests it recorded, as its Audit page and the MCP
 * server's `audit` tool run it, kept to the findings an editor can place:
 * those that concern endpoints — the ones a finding names, or else the ones
 * its requests called, as an N+1 pattern's list and detail calls. A passed
 * check, and a finding about the traffic as a whole or about a middleware,
 * concerns no call in the code.
 *
 * @param inputs - The requests Studio keeps, the sources the project declares and the runtimes attached
 * @returns The findings, errors first
 * @example
 * ```ts
 * editorFindings({ requestLog, ...auditInputsOf(project, root) })[0]?.endpoints;
 * ```
 */
export function editorFindings(inputs: StudioAuditInputs): EditorFinding[] {
  const requests = recordedRequests(inputs.requestLog);
  const browserSessions = new Set(
    inputs.runtimes().flatMap((runtime) => (runtime.kind === "browser" ? [runtime.runtimeId] : [])),
  );
  const result = runAudit(requests, buildCatalog(inputs.declared(), requests), { browserSessions });
  const byId = new Map(requests.map((request) => [request.id, request]));
  return result.items.flatMap((item) => {
    if (item.severity === "pass") return [];
    const endpoints = endpointsOf(item, byId);
    if (endpoints.length === 0) return [];
    return [
      {
        id: item.id,
        severity: item.severity,
        category: item.category,
        title: item.title,
        description: item.description,
        ...(item.suggestion !== undefined && { suggestion: item.suggestion }),
        endpoints,
      },
    ];
  });
}

function endpointsOf(item: AuditItem, byId: ReadonlyMap<string, RequestEntry>): FindingEndpoint[] {
  const named = (item.endpoints ?? []).flatMap(endpointOf);
  if (named.length > 0) return named;
  /* A pattern seen in the requests themselves — an N+1, a waterfall, a repeat — names them alone. */
  const called = new Map<string, FindingEndpoint>();
  for (const id of item.requestIds ?? []) {
    const request = byId.get(id);
    if (!request) continue;
    const endpoint = request.group ? `${request.group}.${request.method}` : request.method;
    called.set(`${request.source}\u0000${endpoint}`, { source: request.source, endpoint });
  }
  return [...called.values()];
}

/* The audit keys an endpoint `source:group:method`; what it keys otherwise, such as a middleware, is no endpoint. */
function endpointOf({ key, detail }: AuditEndpoint): FindingEndpoint[] {
  const parts = key.split(":");
  if (parts.length !== 3) return [];
  const [source = "", group = "", method = ""] = parts;
  if (source === "" || method === "") return [];
  return [
    {
      source,
      endpoint: group === "" ? method : `${group}.${method}`,
      ...(detail !== undefined && { detail }),
    },
  ];
}
