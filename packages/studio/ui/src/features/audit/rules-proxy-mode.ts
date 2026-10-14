import type { RequestEntry } from "@/store/types-request";
import { PROXY_SUGGESTION } from "./code-suggestions";
import type { AuditContext, AuditEndpoint, AuditItem } from "./types";

/**
 * A browser that calls its upstreams directly while nothing goes through
 * the proxy: whatever those calls need, such as a key, reaches the page.
 *
 * Only a runtime that runs in a browser is weighed: a server calling
 * directly keeps its secrets to itself.
 *
 * @param requests - The completed requests
 * @param context - Which sessions are browsers
 * @returns The warning, with the endpoints the browser called, or nothing
 *
 * @example
 * ```ts
 * browserDirectCalls(completed, { browserSessions: new Set(["browser"]) });
 * ```
 */
export function browserDirectCalls(requests: RequestEntry[], context: AuditContext): AuditItem[] {
  if (requests.some((r) => r.mode === "proxy")) return [];
  const fromBrowser = requests.filter((r) => context.browserSessions.has(r.sessionId));
  if (fromBrowser.length === 0) return [];
  return [
    {
      id: "warn-unused-proxy",
      severity: "warning",
      category: "best-practices",
      title: "All requests use direct mode",
      description:
        "The browser calls the upstream directly and nothing goes through the proxy, so whatever those calls need — a key, a token — is exposed to the page.",
      suggestion:
        "Mark the endpoints that need server-side secrets .expose() and call them through a proxy caller of the routes Studio writes, so the API's definition stays on the server.",
      codeSuggestion: PROXY_SUGGESTION,
      endpoints: endpointsOf(fromBrowser),
    },
  ];
}

function endpointsOf(requests: RequestEntry[]): AuditEndpoint[] {
  const byLabel = new Map<string, string[]>();
  for (const r of requests) {
    const label = r.group ? `${r.source}.${r.group}.${r.method}` : `${r.source}.${r.method}`;
    byLabel.set(label, [...(byLabel.get(label) ?? []), r.id]);
  }
  return [...byLabel].map(([label, requestIds]) => ({ key: label, label, requestIds }));
}
