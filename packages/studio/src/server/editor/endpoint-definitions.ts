import { relative, sep } from "node:path";

import { declarationOf } from "../contract-drift/schema-edit/endpoint-declaration";
import { type SourceModules, sourceModules } from "../contract-drift/schema-edit/source-modules";
import type { CatalogEndpoint } from "./endpoint-catalog";
import { resolvedPath } from "./resolved-path";
import { positionsIn, type TextPosition } from "./text-positions";

/** A stretch of a file, as an editor counts: lines and columns from 1, the end just past it. */
export interface TextSpan {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/** Where an endpoint is declared, as an editor goes to it. */
export interface EndpointDefinition extends TextSpan {
  readonly source: string;
  /** Its call in the client: `orders.place` */
  readonly endpoint: string;
  /** The file, relative to the project's root with forward slashes: `src/api/orders.ts` */
  readonly file: string;
  /** Its absolute path, links resolved */
  readonly path: string;
  /** The whole declaration: its name, and the chain that builds it */
  readonly span: TextSpan;
}

/**
 * Where each endpoint the running config defines is declared: the name it
 * has in its group's `endpoints` — where an editor goes to it — and the
 * whole of its declaration. Found as a schema fix finds it, through the
 * config's `sources`, `groups` and `endpoints`, in the files the project
 * writes; an endpoint built at run time, which no file declares, has none.
 *
 * @param root - The project's root
 * @param configFile - The running config's path
 * @param catalog - The endpoints the running config defines
 * @param modules - The project's files as they are read and parsed; read afresh when not given
 * @returns The declarations found, in the catalog's order
 * @example
 * ```ts
 * endpointDefinitions(root, running.configFile, catalog)[0]?.line; // 21
 * ```
 */
export function endpointDefinitions(
  root: string,
  configFile: string,
  catalog: readonly CatalogEndpoint[],
  modules: SourceModules = sourceModules(root),
): EndpointDefinition[] {
  /* The modules are read by their paths with links resolved, the config's too. */
  const config = resolvedPath(configFile);
  const placing = new Map<string, (offset: number) => TextPosition>();
  return catalog.flatMap(({ source, endpoint }) => {
    const declared = declarationOf(modules, config, source, endpoint);
    if ("why" in declared) return [];
    const { path, property } = declared;
    let place = placing.get(path);
    if (!place) {
      place = positionsIn(textOf(modules, path));
      placing.set(path, place);
    }
    const name = spanOf(place, property.key.start, property.key.end);
    const span = spanOf(place, property.start, property.end);
    const file = relative(modules.root, path).split(sep).join("/");
    return [{ source, endpoint, file, path, ...name, span }];
  });
}

function textOf(modules: SourceModules, path: string): string {
  return modules.module(path)?.text ?? "";
}

function spanOf(place: (offset: number) => TextPosition, start: number, end: number): TextSpan {
  const from = place(start);
  const to = place(end);
  return { line: from.line, column: from.column, endLine: to.line, endColumn: to.column };
}
