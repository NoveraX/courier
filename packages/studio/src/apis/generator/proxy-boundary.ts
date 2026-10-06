import { isReadingMethod } from "@noverax/courier/internal";
import { isTopLevel } from "../parser/top-level";
import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { objectKey } from "./literals";
import { isEventStream } from "./response-reading";

/** How the browser reaches an endpoint through the proxy: as a read, a write, or a stream. */
export type ExposedShape = "query" | "mutation" | "stream";

/**
 * Every endpoint of an import as a proxy boundary names it: its path from
 * the source, through each group it sits in, and the shape it reaches the
 * wire in — a stream of events, a request that reads, or one that writes,
 * as the generated chain makes it.
 *
 * @param spec - The specification as the import generates it
 * @returns Each endpoint's path and shape, in generation order
 * @example
 * ```ts
 * boundaryExposure(spec); // [["health", "query"], ["responses.stream", "stream"]]
 * ```
 */
export function boundaryExposure(spec: ParsedSpec): Array<[path: string, shape: ExposedShape]> {
  const byName = new Map(spec.groups.map((group) => [group.name, group]));
  const pathOf = (group: ParsedGroup | undefined): string => {
    if (group === undefined || isTopLevel(group)) return "";
    const outer = pathOf(group.parent === undefined ? undefined : byName.get(group.parent));
    return outer === "" ? group.name : `${outer}.${group.name}`;
  };
  return spec.groups.flatMap((group) => {
    const at = pathOf(group);
    return group.endpoints.map((ep): [string, ExposedShape] => [
      at === "" ? ep.name : `${at}.${ep.name}`,
      isEventStream(ep) ? "stream" : isReadingMethod(ep.httpMethod) ? "query" : "mutation",
    ]);
  });
}

/**
 * The boundary a proxy caller of an import with streams is given: every
 * endpoint, and how each reaches the wire.
 *
 * @param source - The source's name, as the proxy addresses it
 * @param exposure - Each endpoint's path and shape
 * @returns The lines declaring `<source>Boundary`
 */
export function boundaryLines(
  source: string,
  exposure: ReadonlyArray<[path: string, shape: ExposedShape]>,
): string[] {
  return [
    "/**",
    ` * What the browser reaches of \`${source}\` through the proxy: every endpoint of`,
    " * the import, and how each reaches the wire. A stream opens a connection of",
    " * its own, so the proxy caller has to know which endpoints are streams, and",
    " * learns it here rather than from the source, which keeps the upstream's",
    " * address and the schemas out of the browser. It refuses nothing on the",
    " * server: for that, give the source a boundary of its own.",
    " */",
    `export const ${source}Boundary = defineBoundary({`,
    `  source: ${JSON.stringify(source)},`,
    "  expose: {",
    ...exposure.map(([path, shape]) => `    ${objectKey(path)}: ${JSON.stringify(shape)},`),
    "  },",
    "});",
    "",
  ];
}
