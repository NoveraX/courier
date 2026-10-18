import type { ServedTool } from "@noverax/courier-mcp/internal";

import { auditedCalls } from "@/features/audit/audited-calls";
import { runAudit } from "@/features/audit/run-audit";
import type { AuditEndpoint, AuditItem, AuditSeverity } from "@/features/audit/types";
import { ownRequests } from "@/features/requests/own-requests";
import { buildCatalog } from "@/store/build-catalog";
import type { ScannedSource } from "../build-source-scan";
import type { RequestLog } from "../request-log";
import { recordedRequests } from "./recorded-requests";

/** What Studio's audit reads besides the requests it recorded. */
export interface StudioAuditInputs {
  readonly requestLog: Pick<RequestLog, "events">;
  /** The sources the config declares, as Studio scanned them. */
  readonly declared: () => readonly ScannedSource[];
  /** The runtimes attached now, and where each runs. */
  readonly runtimes: () => ReadonlyArray<{ runtimeId: string; kind: "browser" | "server" }>;
}

const SEVERITIES: readonly AuditSeverity[] = ["error", "warning", "hint", "pass"];

/* The requests a finding names, the newest first: a few are enough to read one of them in full. */
const NAMED_REQUESTS = 5;

/**
 * The tool that runs Studio's audit over the requests it recorded — the
 * audit its Audit page runs, by the same rules — and answers with the score
 * and each finding: what is wrong, how badly, which endpoints it concerns,
 * a few of the requests behind it, and the fix, often as code — with the
 * calls it read and the requests they sent, as the page's head counts them.
 *
 * @param inputs - The request log, the declared sources and the attached runtimes
 * @returns The tool
 * @example
 * ```ts
 * auditTool({ requestLog, declared: () => scan.sources, runtimes: () => [] }).run({}, caller);
 * ```
 */
export function auditTool(inputs: StudioAuditInputs): ServedTool {
  return {
    name: "audit",
    title: "Audit findings",
    description:
      "Studio's audit of the requests it recorded, as its Audit page runs it: the score out of 100 and each finding on performance, reliability, security and best practices — errors first — with the endpoints it concerns, a few of the requests behind it (read one with request) and the suggested fix, often as code. Passed checks are left out unless asked for.",
    access: "read",
    idempotent: true,
    action: "read audit",
    inputSchema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["error", "warning", "hint"],
          description:
            "The least severe finding to include: hint by default, error for the errors alone",
        },
        passed: { type: "boolean", description: "Include the checks that passed" },
        endpoint: {
          type: "string",
          description: "Only findings about endpoints whose name holds this, such as orders.create",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        score: { type: "number" },
        findings: { type: "array", items: { type: "object" } },
      },
      required: ["score", "findings"],
    },
    run: async (args) => ({ ok: true, data: auditOf(inputs, args) }),
  };
}

function auditOf(
  inputs: StudioAuditInputs,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const requests = recordedRequests(inputs.requestLog);
  const browserSessions = new Set(
    inputs.runtimes().flatMap((runtime) => (runtime.kind === "browser" ? [runtime.runtimeId] : [])),
  );
  const result = runAudit(requests, buildCatalog(inputs.declared(), requests), { browserSessions });
  const least = SEVERITIES.indexOf(isSeverity(args.severity) ? args.severity : "hint");
  const wanted = typeof args.endpoint === "string" ? args.endpoint : undefined;
  const findings = result.items.filter(
    (item) =>
      (SEVERITIES.indexOf(item.severity) <= least ||
        (item.severity === "pass" && args.passed === true)) &&
      (wanted === undefined || concerns(item, wanted)),
  );
  const read = auditedCalls(requests);
  return {
    score: result.score,
    breakdown: result.breakdown,
    calls: read.length,
    requests: ownRequests(read).length,
    findings: findings.map(findingOf),
  };
}

function isSeverity(value: unknown): value is AuditSeverity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

/* A finding that names no endpoint is about the traffic as a whole, and concerns none in particular. */
function concerns(item: AuditItem, wanted: string): boolean {
  return (item.endpoints ?? []).some((endpoint) => endpoint.label.includes(wanted));
}

function findingOf(item: AuditItem): Record<string, unknown> {
  return {
    id: item.id,
    severity: item.severity,
    category: item.category,
    title: item.title,
    description: item.description,
    ...(item.suggestion !== undefined && { suggestion: item.suggestion }),
    ...(item.codeSuggestion !== undefined && { code: item.codeSuggestion }),
    ...(item.endpoints !== undefined && { endpoints: item.endpoints.map(endpointOf) }),
    ...(item.requestIds !== undefined && { requests: item.requestIds.slice(0, NAMED_REQUESTS) }),
  };
}

function endpointOf(endpoint: AuditEndpoint): Record<string, unknown> {
  return {
    endpoint: endpoint.label,
    ...(endpoint.detail !== undefined && { detail: endpoint.detail }),
    ...(endpoint.requestIds !== undefined && {
      requests: endpoint.requestIds.slice(0, NAMED_REQUESTS),
    }),
  };
}
