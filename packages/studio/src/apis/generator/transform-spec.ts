/**
 * Transform parsed spec based on GenerateOptions (groupBy).
 * Applied before code generation so the generator always works with
 * a consistently shaped ParsedSpec.
 */

import type { ParsedEndpoint, ParsedGroup, ParsedSpec } from "../parser/types";
import { uniqueEndpointNames } from "../parser/unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toBindingName } from "../parser/utils";
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
      endpoints: uniqueEndpointNames(endpoints).map((e) => ({
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
  const taken = new Set<string>();
  for (const [segment, eps] of bySegment) {
    const prefix = findCommonPrefix(eps.map((e) => e.fullPath));
    /* A URL segment is not an identifier: Twilio's `2010-04-01` became
       `20100401`, and `export const 20100401` does not parse. */
    groups.push({
      name: claim(toBindingName(segment), taken),
      description: "",
      prefix,
      endpoints: uniqueEndpointNames(eps, prefix).map((e) => ({
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

/** Take a name, or the first numbered variant of it that is still free. */
function claim(name: string, taken: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${name}${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}
