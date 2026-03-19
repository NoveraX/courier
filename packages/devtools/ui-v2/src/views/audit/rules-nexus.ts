import type { Catalog } from "../../store/types-ui";
import type { AuditItem, EndpointStats } from "./types";

/** Same endpoint called in both direct and proxy mode. */
function mixedModeUsage(stats: Map<string, EndpointStats>): AuditItem[] {
  const mixed = [...stats.values()].filter(
    (s) => s.modes.has("direct") && s.modes.has("proxy"),
  );
  if (mixed.length === 0) return [];

  return [{
    id: "nexus-mixed-mode",
    severity: "warning",
    category: "best-practices",
    title: "Mixed mode usage",
    description: "Same endpoint called in both direct and proxy mode — secrets may leak via direct calls.",
    suggestion: "Use proxy mode consistently for endpoints that access server-side secrets.",
    endpoints: mixed.map((s) => ({
      key: s.key,
      label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
      detail: "direct + proxy",
      requestIds: s.requestIds.slice(0, 3),
    })),
  }];
}

/** Endpoints without type: "query" | "mutation". */
function missingTypeAnnotation(catalog: Catalog): AuditItem[] {
  const missing: { key: string; label: string }[] = [];
  for (const [src, entry] of Object.entries(catalog)) {
    for (const [grp, group] of Object.entries(entry.groups)) {
      for (const [ep, cfg] of Object.entries(group.endpoints)) {
        if (!cfg.type) {
          const label = grp ? `${src}.${grp}.${ep}` : `${src}.${ep}`;
          missing.push({ key: `${src}:${grp}:${ep}`, label });
        }
      }
    }
  }
  if (missing.length === 0) return [];

  return [{
    id: "nexus-missing-type",
    severity: "hint",
    category: "best-practices",
    title: "Missing endpoint type",
    description: "Endpoints without type: 'query' | 'mutation'. GET caching won't work in proxy mode.",
    suggestion: "Add type to enable HTTP-semantic proxy routing.",
    codeSuggestion: `endpoint<Response>({\n  type: "query", // or "mutation"\n})((http) => http.get("endpoint"));`,
    endpoints: missing,
  }];
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

  return [{
    id: "nexus-retry-mutation",
    severity: "warning",
    category: "reliability",
    title: "Retry on non-idempotent mutation",
    description: "Mutation endpoints with retry middleware may cause duplicate side effects.",
    suggestion: "Remove retry from mutations, or ensure the backend is idempotent.",
    endpoints: risky,
  }];
}

/** Collect Nexus-specific audit rules. */
export function collectNexusRules(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  return [
    ...mixedModeUsage(stats),
    ...missingTypeAnnotation(catalog),
    ...retryWithoutIdempotency(catalog),
  ];
}
