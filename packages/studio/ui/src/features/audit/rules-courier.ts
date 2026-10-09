import type { Catalog } from "@/store/types-ui";
import { IDEMPOTENCY_SUGGESTION } from "./code-suggestions";
import type { AuditItem, EndpointStats } from "./types";

/** Same endpoint called in both direct and proxy mode. */
function mixedModeUsage(stats: Map<string, EndpointStats>): AuditItem[] {
  const mixed = [...stats.values()].filter((s) => s.modes.has("direct") && s.modes.has("proxy"));
  if (mixed.length === 0) return [];

  return [
    {
      id: "courier-mixed-mode",
      severity: "warning",
      category: "best-practices",
      title: "Mixed mode usage",
      description:
        "Same endpoint called in both direct and proxy mode — secrets may leak via direct calls.",
      suggestion: "Use proxy mode consistently for endpoints that access server-side secrets.",
      endpoints: mixed.map((s) => ({
        key: s.key,
        label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
        detail: "direct + proxy",
        requestIds: s.requestIds.slice(0, 3),
      })),
    },
  ];
}

/*
 * A write that runs retry middleware with no idempotency key. Courier sends
 * such a write once — unless the middleware sets `mutations: true`, which
 * sends it again where the upstream cannot tell a repeat. A write whose
 * calls carry a key is retried safely, and is left out.
 */
function retryWithoutIdempotency(stats: Map<string, EndpointStats>, catalog: Catalog): AuditItem[] {
  const risky: { key: string; label: string }[] = [];
  for (const [src, entry] of Object.entries(catalog)) {
    for (const [grp, group] of Object.entries(entry.groups)) {
      for (const [ep, cfg] of Object.entries(group.endpoints)) {
        const key = `${src}:${grp}:${ep}`;
        if (
          cfg.type === "mutation" &&
          cfg.middleware?.some((m) => m.toLowerCase().includes("retry")) &&
          stats.get(key)?.keyed !== true
        ) {
          risky.push({ key, label: grp ? `${src}.${grp}.${ep}` : `${src}.${ep}` });
        }
      }
    }
  }
  if (risky.length === 0) return [];

  return [
    {
      id: "courier-retry-mutation",
      severity: "hint",
      category: "reliability",
      title: "Retried writes without an idempotency key",
      description:
        "These writes run retry middleware, and their calls carry no idempotency key. Courier sends each once, so a write whose answer was lost is not tried again — unless the middleware sets mutations: true, which sends it again where the upstream cannot tell a repeat.",
      suggestion:
        "Declare an idempotencyKey on these endpoints: each call sends one key on every attempt, so the upstream applies a retried write once.",
      codeSuggestion: IDEMPOTENCY_SUGGESTION,
      endpoints: risky,
    },
  ];
}

/** Collect Courier-specific audit rules. */
export function collectCourierRules(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  return [...mixedModeUsage(stats), ...retryWithoutIdempotency(stats, catalog)];
}
