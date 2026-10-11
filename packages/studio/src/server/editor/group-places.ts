import { relative } from "node:path";
import type { Expression, ObjectExpression } from "oxc-parser";

import { endpointsOf } from "../contract-drift/schema-edit/endpoint-declaration";
import { sourceModules } from "../contract-drift/schema-edit/source-modules";
import { keyName } from "../contract-drift/schema-edit/written-schema";
import type { CatalogEndpoint } from "./endpoint-catalog";
import { resolvedPath } from "./resolved-path";
import { positionsIn, type TextPosition } from "./text-positions";

/** Where a group's endpoints are written, as an editor adds one to them. */
export interface GroupPlace {
  readonly source: string;
  /** The group's names from the source down: `admin.orders`; empty for the source itself */
  readonly group: string;
  /** The file, relative to the project's root */
  readonly file: string;
  /** Its absolute path, links resolved */
  readonly path: string;
  /** The `endpoints` object's braces */
  readonly open: TextPosition;
  readonly close: TextPosition;
  /** The last endpoint written, and whether a comma follows it */
  readonly last?: (TextPosition & { readonly comma: boolean }) | undefined;
  /** The endpoints' names already taken */
  readonly names: readonly string[];
  /** What the endpoints are built with in that file: `endpoint` in `endpoint.get(…)` */
  readonly builder?: string | undefined;
}

/**
 * Where each group of the running config writes its endpoints — the source
 * itself and every group its endpoints' calls name — as an editor adds an
 * endpoint: the `endpoints` object's braces, its last endpoint and whether
 * a comma follows, the names taken, and what the file builds endpoints
 * with. A group whose endpoints no file writes in one object has none.
 *
 * @param root - The project's root
 * @param configFile - The running config's path
 * @param catalog - The endpoints the running config defines
 * @returns The places, source by source
 * @example
 * ```ts
 * groupPlaces(root, running.configFile, catalog).find((place) => place.group === "orders");
 * ```
 */
export function groupPlaces(
  root: string,
  configFile: string,
  catalog: readonly CatalogEndpoint[],
): GroupPlace[] {
  const modules = sourceModules(root);
  const config = resolvedPath(configFile);
  return groupsOf(catalog).flatMap(({ source, groups }) => {
    const found = endpointsOf(modules, config, source, groups);
    if ("why" in found) return [];
    const text = modules.module(found.path)?.text ?? "";
    const place = positionsIn(text);
    const { literal } = found;
    const last = lastProperty(literal);
    const lastPlace = last && { ...place(last.end), comma: commaAfter(text, last.end) };
    return [
      {
        source,
        group: groups.join("."),
        file: relative(modules.root, found.path),
        path: found.path,
        open: place(literal.start),
        close: place(literal.end - 1),
        ...(lastPlace && { last: lastPlace }),
        names: literal.properties.flatMap((each) =>
          each.type === "Property" ? (keyName(each) ?? []) : [],
        ),
        builder: builderOf(last?.value),
      },
    ];
  });
}

/* The source and every group its endpoints' calls name, each once: `admin`, `admin.orders`. */
function groupsOf(catalog: readonly CatalogEndpoint[]): { source: string; groups: string[] }[] {
  const seen = new Map<string, { source: string; groups: string[] }>();
  for (const { source, parts } of catalog) {
    for (let depth = 0; depth < parts.length; depth++) {
      const groups = parts.slice(0, depth);
      const key = `${source}\u0000${groups.join(".")}`;
      if (!seen.has(key)) seen.set(key, { source, groups });
    }
  }
  return [...seen.values()];
}

function lastProperty(literal: ObjectExpression) {
  const last = literal.properties.at(-1);
  return last?.type === "Property" ? last : undefined;
}

/* Whether the first thing after an offset, past spaces and comments, is a comma. */
function commaAfter(text: string, offset: number): boolean {
  const rest = text.slice(offset).replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return rest.startsWith(",");
}

/* The name a builder chain starts from: `endpoint` in `endpoint.post("").response(…)`. */
function builderOf(node: Expression | undefined): string | undefined {
  let current: Expression | undefined = node;
  while (current && (current.type === "CallExpression" || current.type === "MemberExpression")) {
    current = current.type === "CallExpression" ? current.callee : current.object;
  }
  return current?.type === "Identifier" ? current.name : undefined;
}
