/**
 * The groups an OpenAPI document's tags turn into: each tag after the tags
 * it sits in, in the order tags first appear, with the prefix its whole
 * subtree's paths share — built in one pass, as the recursive reading it
 * replaces built them, which stays here to check it against.
 */
import { describe, expect, it } from "vitest";

import { buildGroups } from "../../../src/apis/parser/openapi-groups";
import type { ParsedEndpoint, ParsedGroup } from "../../../src/apis/parser/types";
import { uniqueEndpointNames } from "../../../src/apis/parser/unique-endpoint-names";
import { convertPathParams, findCommonPrefix, toGroupName } from "../../../src/apis/parser/utils";
import { seededRandom } from "../../helpers/seeded-random";

function endpoint(fullPath: string): ParsedEndpoint {
  return {
    name: `at${fullPath.replace(/\W/g, "")}`,
    operationId: null,
    httpMethod: "get",
    path: fullPath,
    fullPath,
    description: "",
    secured: false,
    requestBody: null,
    parameters: [],
    responseSchema: null,
    tags: [],
  };
}

function byTag(entries: Array<[string, string[]]>): Map<string, ParsedEndpoint[]> {
  return new Map(entries.map(([tag, paths]) => [tag, paths.map(endpoint)]));
}

/* The reading this one replaced, as it stood: each tag's subtree gathered anew, recursively. */
function recursiveBuildGroups(
  endpointsByTag: Map<string, ParsedEndpoint[]>,
  tagDescriptions: Map<string, string>,
  parents: ReadonlyMap<string, string> = new Map(),
): ParsedGroup[] {
  const tags = tagsInOrder([...endpointsByTag.keys()], parents);
  const parentOf = (tag: string) => parents.get(tag);
  const below = (tag: string): string[] => tags.filter((t) => parentOf(t) === tag);
  const subtree = (tag: string): ParsedEndpoint[] => [
    ...(endpointsByTag.get(tag) ?? []),
    ...below(tag).flatMap(subtree),
  ];
  const prefixes = new Map(
    tags.map((tag) => [tag, findCommonPrefix(subtree(tag).map((e) => e.fullPath))]),
  );
  const names = new Map<string, string>();
  const usedNames = new Set<string>();

  return tags.map((tag): ParsedGroup => {
    const prefix = prefixes.get(tag) ?? "/";
    const name = deduplicateName(resolveGroupName(tag, prefix), usedNames);
    usedNames.add(name);
    names.set(tag, name);
    const parent = parentOf(tag);
    const endpoints = endpointsByTag.get(tag) ?? [];
    return {
      name,
      description: tagDescriptions.get(tag) ?? "",
      prefix: convertPathParams(parent ? within(prefix, prefixes.get(parent) ?? "/") : prefix),
      ...(parent && { parent: names.get(parent) }),
      endpoints: uniqueEndpointNames(endpoints, prefix).map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    };
  });
}

function tagsInOrder(withEndpoints: string[], parents: ReadonlyMap<string, string>): string[] {
  const ordered: string[] = [];
  const add = (tag: string): void => {
    if (ordered.includes(tag)) return;
    const parent = parents.get(tag);
    if (parent !== undefined) add(parent);
    ordered.push(tag);
  };
  for (const tag of withEndpoints) add(tag);
  return ordered;
}

function within(path: string, outer: string): string {
  if (outer === "/" || !path.startsWith(outer)) return path;
  return path.slice(outer.length).replace(/^\//, "");
}

function resolveGroupName(tag: string, prefix: string): string {
  const name = toGroupName(tag);
  if (name) return name;
  const lastSegment = prefix.split("/").filter(Boolean).pop();
  return lastSegment ? toGroupName(lastSegment) : "defaultGroup";
}

function deduplicateName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name}${i}`)) i++;
  return `${name}${i}`;
}

describe("buildGroups", () => {
  it("puts each tag after the tags it sits in, in the order tags first appear", () => {
    const groups = buildGroups(
      byTag([
        ["lines", ["/billing/invoices/lines"]],
        ["store", ["/store"]],
      ]),
      new Map(),
      new Map([
        ["lines", "invoices"],
        ["invoices", "billing"],
      ]),
    );

    expect(groups.map((group) => `${group.name}<${group.parent ?? ""}`)).toEqual([
      "billing<",
      "invoices<billing",
      "lines<invoices",
      "store<",
    ]);
  });

  it("gives each group the prefix its subtree shares, up to a parameter, or one path's parent", () => {
    const groups = buildGroups(
      byTag([
        ["invoices", ["/billing/invoices", "/billing/invoices/{id}"]],
        ["refunds", ["/billing/refunds/{id}/lines"]],
        ["billing", []],
      ]),
      new Map(),
      new Map([
        ["invoices", "billing"],
        ["refunds", "billing"],
      ]),
    );

    expect(groups.map((group) => `${group.name}=${group.prefix}`)).toEqual([
      "billing=/billing",
      "invoices=invoices",
      "refunds=refunds/:id",
    ]);
  });

  it("builds a chain of 3 000 nested tags", () => {
    const parents = new Map(
      Array.from({ length: 2_999 }, (_, at): [string, string] => [`t${at + 1}`, `t${at}`]),
    );
    const groups = buildGroups(byTag([["t2999", ["/deep/end"]]]), new Map(), parents);

    expect(groups).toHaveLength(3_000);
  });

  it("builds what the recursive reading built, on 2 000 random forests of tags", () => {
    const segments = ["a", "b", "{id}", ":id", "c"];
    /* `a0`, `A0` and `a 0` all make the group name `a0`, so names are numbered too. */
    const spellings = ["a", "A", "a "];
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const next = seededRandom(seed);
      const tags = Array.from({ length: 1 + next(12) }, (_, at) => `${spellings[at % 3]}${at % 4}`);
      const unique = [...new Set(tags)];
      const parents = new Map<string, string>();
      for (let at = 1; at < unique.length; at += 1) {
        if (next(3) > 0) parents.set(unique[at] ?? "", unique[next(at)] ?? "");
      }
      const path = () => `/${Array.from({ length: next(4) }, () => segments[next(5)]).join("/")}`;
      const endpointsByTag = byTag(
        unique
          .map((tag): [string, string[]] => [tag, Array.from({ length: next(3) }, path)])
          .filter(([, paths]) => paths.length > 0 || next(2) === 0),
      );
      const descriptions = new Map([[unique[0] ?? "", "The first tag"]]);

      expect(JSON.stringify(buildGroups(endpointsByTag, descriptions, parents))).toBe(
        JSON.stringify(recursiveBuildGroups(endpointsByTag, descriptions, parents)),
      );
    }
  });
});
