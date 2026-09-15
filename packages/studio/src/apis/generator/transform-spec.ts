/**
 * Transform parsed spec based on GenerateOptions (groupBy).
 * Applied before code generation so the generator always works with
 * a consistently shaped ParsedSpec.
 */

import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../parser/types";
import { convertPathParams, findCommonPrefix, toCamelCase } from "../parser/utils";
import type { ResolvedGenerateOptions } from "./types";

export function transformSpec(spec: ParsedSpec, options: ResolvedGenerateOptions): ParsedSpec {
  if (options.groupBy === "tag") return spec;

  const groups = regroupEndpoints(spec, options.groupBy);
  return { ...spec, groups };
}

// ── GroupBy ──────────────────────────────────────────────────────────────────

function regroupEndpoints(spec: ParsedSpec, groupBy: "path" | "single"): ParsedGroup[] {
  const allEndpoints = spec.groups.flatMap((g) => g.endpoints);

  if (groupBy === "single") {
    return buildSingleGroup(allEndpoints);
  }

  return buildPathGroups(allEndpoints);
}

function buildSingleGroup(endpoints: ParsedEndpoint[]): ParsedGroup[] {
  /* Flat mode: no group prefix, each endpoint gets its full path */
  return [
    {
      name: "api",
      description: "",
      prefix: "/",
      endpoints: endpoints.map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath),
      })),
    },
  ];
}

function buildPathGroups(endpoints: ParsedEndpoint[]): ParsedGroup[] {
  const bySegment = new Map<string, ParsedEndpoint[]>();

  for (const ep of endpoints) {
    const segment = extractFirstSegment(ep.fullPath);
    if (!bySegment.has(segment)) bySegment.set(segment, []);
    bySegment.get(segment)!.push(ep);
  }

  const groups: ParsedGroup[] = [];
  for (const [segment, eps] of bySegment) {
    const prefix = findCommonPrefix(eps.map((e) => e.fullPath));
    groups.push({
      name: toCamelCase(segment) || segment,
      description: "",
      prefix,
      endpoints: eps.map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    });
  }
  return groups;
}

function extractFirstSegment(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "default";
  /* Skip path params — use second segment if available */
  if (first.startsWith("{") || first.startsWith(":")) {
    return segments[1] ?? "default";
  }
  return first;
}
