import type { Catalog } from "@/store/types-ui";
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

/** Mutation with retry middleware — dangerous without idempotency. */
function retryWithoutIdempotency(catalog: Catalog): AuditItem[] {
  const risky: { key: string; label: string }[] = [];
  for (const [src, entry] of Object.entries(catalog)) {
    for (const [grp, group] of Object.entries(entry.groups)) {
      for (const [ep, cfg] of Object.entries(group.endpoints)) {
        if (
          cfg.type === "mutation" &&
          cfg.middleware?.some((m) => m.toLowerCase().includes("retry"))
        ) {
          const label = grp ? `${src}.${grp}.${ep}` : `${src}.${ep}`;
          risky.push({ key: `${src}:${grp}:${ep}`, label });
        }
      }
    }
  }
  if (risky.length === 0) return [];

  return [
    {
      id: "courier-retry-mutation",
      severity: "warning",
      category: "reliability",
      title: "Retry on non-idempotent mutation",
      description: "Mutation endpoints with retry middleware may cause duplicate side effects.",
      suggestion: "Remove retry from mutations, or ensure the backend is idempotent.",
      endpoints: risky,
    },
  ];
}

/** Collect Courier-specific audit rules. */
export function collectCourierRules(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  return [...mixedModeUsage(stats), ...retryWithoutIdempotency(catalog)];
}
