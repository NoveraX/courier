import type { Catalog } from "../../store/types-ui";
import type { AuditEndpoint, AuditItem, EndpointStats } from "./types";

function formatEp(s: EndpointStats): AuditEndpoint {
  return {
    key: s.key,
    label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
    requestIds: s.requestIds,
  };
}

function noCachingDetected(stats: Map<string, EndpointStats>): AuditItem[] {
  const frequent = [...stats.values()].filter((s) => s.count >= 3);
  if (frequent.length === 0) return [];
  return [{
    id: "hint-no-caching",
    severity: "hint",
    category: "performance",
    title: "No caching detected",
    description: "None of the frequently called endpoints show caching behavior.",
    suggestion: "Add cache middleware or set cache headers for read-only endpoints.",
    codeSuggestion: `import { cache } from "@noverax/nexus/middleware";\n\ndefineApi({\n  middleware: [cache({ ttl: 60_000 })],\n});`,
  }];
}

function noResponseValidation(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => !s.hasResponseValidation);
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-res-val",
    severity: "hint",
    category: "security",
    title: "No response validation",
    description: "Endpoints without a response schema — malformed data may slip through.",
    suggestion: "Add a response schema with Zod, Valibot, or ArkType.",
    codeSuggestion: `endpoint<User>({\n  response: z.object({\n    id: z.number(),\n    name: z.string(),\n  }),\n})((http) => http.get("users/1"));`,
    endpoints: matched.map(formatEp),
  }];
}

function noVariablesValidation(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => !s.hasVariablesValidation);
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-var-val",
    severity: "hint",
    category: "security",
    title: "No input validation",
    description: "Endpoints send unvalidated variables to the server.",
    suggestion: "Add a variables schema to validate inputs before sending.",
    codeSuggestion: `endpoint<Response, { id: number }>({\n  variables: z.object({ id: z.number() }),\n})((http, vars) => http.get(\`users/\${vars.id}\`));`,
    endpoints: matched.map(formatEp),
  }];
}

/** Only reports catalog endpoints that were NOT called. */
function missingAllSchemas(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  const calledKeys = new Set(stats.keys());
  const matched: AuditEndpoint[] = [];
  for (const [src, entry] of Object.entries(catalog)) {
    for (const [grp, group] of Object.entries(entry.groups)) {
      for (const [ep, cfg] of Object.entries(group.endpoints)) {
        const key = `${src}:${grp}:${ep}`;
        if (calledKeys.has(key)) continue;
        if (!cfg.hasVariablesSchema && !cfg.hasResponseSchema) {
          const label = grp ? `${src}.${grp}.${ep}` : `${src}.${ep}`;
          matched.push({ key, label });
        }
      }
    }
  }
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-schema",
    severity: "hint",
    category: "best-practices",
    title: "No schemas at all",
    description: "Uncalled endpoints with neither variables nor response schema.",
    suggestion: "Add type-safe schemas for full validation coverage.",
    endpoints: matched,
  }];
}

const PROXY_OVERHEAD_THRESHOLD = 0.5;

function proxyLatencyOverhead(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.proxyOverhead > PROXY_OVERHEAD_THRESHOLD && s.modes.has("proxy"),
  );
  if (matched.length === 0) return [];
  return [{
    id: "hint-proxy-overhead",
    severity: "hint",
    category: "performance",
    title: "High proxy overhead",
    description: "Proxy mode adds more than 50% latency overhead vs direct fetch.",
    suggestion: "Use direct mode for endpoints that don't need server-side secrets.",
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `${(s.proxyOverhead * 100).toFixed(0)}% overhead`,
    })),
  }];
}

const VALIDATION_OVERHEAD_THRESHOLD = 0.2;

function validationOverhead(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.validationOverhead > VALIDATION_OVERHEAD_THRESHOLD,
  );
  if (matched.length === 0) return [];
  return [{
    id: "hint-validation-overhead",
    severity: "hint",
    category: "performance",
    title: "High validation overhead",
    description: "Schema validation takes more than 20% of total request time.",
    suggestion: "Simplify the schema or use a faster validation library.",
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `${(s.validationOverhead * 100).toFixed(0)}% of request time`,
    })),
  }];
}

function inconsistentStatusCodes(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => {
    const successCodes = s.statusCodes.filter((c) => c >= 200 && c < 300);
    const unique = new Set(successCodes);
    return unique.size > 1;
  });
  if (matched.length === 0) return [];
  return [{
    id: "hint-inconsistent-status",
    severity: "hint",
    category: "best-practices",
    title: "Inconsistent status codes",
    description: "Same endpoint returns different success status codes (e.g. mix of 200/201/204).",
    suggestion: "Standardize success status codes for predictable client handling.",
    endpoints: matched.map((s) => {
      const unique = [...new Set(s.statusCodes.filter((c) => c >= 200 && c < 300))];
      return { ...formatEp(s), detail: unique.join(", ") };
    }),
  }];
}

/** Collect pass items for endpoints that meet all quality criteria. */
export function collectPasses(
  stats: Map<string, EndpointStats>,
): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) =>
      s.hasVariablesValidation &&
      s.hasResponseValidation &&
      s.errorRate < 0.05 &&
      s.p95 < 500 &&
      s.count >= 3,
  );
  if (matched.length === 0) return [];
  return [{
    id: "pass-healthy",
    severity: "pass",
    category: "best-practices",
    title: "Healthy endpoints",
    description: "Endpoints with schemas, low error rate, and fast response times.",
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `P95 = ${s.p95.toFixed(0)}ms`,
    })),
  }];
}

/** Collect all hint-severity audit items. */
export function collectHints(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  return [
    ...noCachingDetected(stats),
    ...noResponseValidation(stats),
    ...noVariablesValidation(stats),
    ...missingAllSchemas(stats, catalog),
    ...proxyLatencyOverhead(stats),
    ...validationOverhead(stats),
    ...inconsistentStatusCodes(stats),
  ];
}
