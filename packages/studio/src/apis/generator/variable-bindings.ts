/**
 * How an endpoint's closure takes parameters out of its variables.
 */

import { isReservedBinding } from "../parser/reserved-bindings";
import type { ParsedParameter } from "../parser/types";
import { objectKey } from "./literals";
import { styledQuery } from "./styled-query";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/* Bound by the closure itself; a name no module may bind is a reserved binding. */
const TAKEN = new Set(["http", "body", "form", "formBody", "formQuery", "vars"]);

/** A destructuring pattern, and the query string it feeds. */
export interface Bindings {
  /** The pattern's entries, without braces: `dryRun, "page-size": param1`. */
  pattern: string;
  /**
   * The query string's object, `{ dryRun }` — written by `formQuery` when a
   * parameter has a style of its own — or `null` without query parameters.
   */
  searchParams: string | null;
}

/**
 * Take parameters out of the variables: the query parameters, to be sent in
 * the query string, and others only to be left out of what remains. A name
 * that cannot be bound as it is — `page-size`, `class`, `body` — is taken
 * under a local name of its own.
 *
 * @param query - The query parameters
 * @param omitted - Parameters only to be left out of the rest
 * @returns The pattern and the query string's object
 * @example
 * ```ts
 * destructure([dryRun, pageSize], []);
 * // { pattern: 'dryRun, "page-size": param1', searchParams: '{ dryRun, "page-size": param1 }' }
 * ```
 */
export function destructure(
  query: readonly ParsedParameter[],
  omitted: readonly ParsedParameter[],
): Bindings {
  const pattern: string[] = [];
  const fields: string[] = [];
  [...query, ...omitted].forEach((param, index) => {
    const local = bindable(param.name) ? param.name : `param${index}`;
    const binding = local === param.name ? local : `${objectKey(param.name)}: ${local}`;
    pattern.push(binding);
    if (index < query.length) fields.push(binding);
  });
  return {
    pattern: pattern.join(", "),
    searchParams: fields.length > 0 ? styledQuery(`{ ${fields.join(", ")} }`, query) : null,
  };
}

function bindable(name: string): boolean {
  return IDENTIFIER.test(name) && !isReservedBinding(name) && !TAKEN.has(name);
}
