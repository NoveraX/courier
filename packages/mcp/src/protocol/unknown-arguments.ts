import type { JSONSchema } from "@noverax/courier/openapi";

import { isRecord } from "../is-record";
import type { ServedTool } from "./served-tool";

/**
 * The sentence refusing a call that names an argument its tool does not
 * take. A tool's input schema names every argument it takes where it says
 * `additionalProperties: false` and gives no `patternProperties`: any other
 * name is refused, before anything runs. A schema that lets other names
 * through, or names them by a pattern, leaves them to the tool.
 *
 * @param tool - The tool called
 * @param args - Its arguments, as the client sent them
 * @returns The sentence, naming the arguments the tool does not take and
 *   those it does; `undefined` when it takes every one
 * @example
 * ```ts
 * unknownArguments(docsRead, { page: "quick-start", heading: "Install" });
 * // '"heading" is not an argument of docs_read, which takes "page", "section" and "offset"'
 * ```
 */
export function unknownArguments(
  tool: ServedTool,
  args: Record<string, unknown>,
): string | undefined {
  const taken = namedArguments(tool.inputSchema);
  if (taken === undefined) return undefined;
  const unknown = Object.keys(args).filter((name) => !Object.hasOwn(taken, name));
  if (unknown.length === 0) return undefined;
  const names = Object.keys(taken);
  const what = unknown.length === 1 ? "is not an argument" : "are not arguments";
  return `${listed(unknown)} ${what} of ${tool.name}, which takes ${names.length === 0 ? "none" : listed(names)}`;
}

/* The arguments a schema takes, by name, where it takes no others. */
function namedArguments(schema: JSONSchema): Record<string, unknown> | undefined {
  if (schema.additionalProperties !== false || schema.patternProperties !== undefined) {
    return undefined;
  }
  return isRecord(schema.properties) ? schema.properties : {};
}

/* Each name quoted, so one that is empty or holds a line break reads as what was sent. */
function listed(names: readonly string[]): string {
  const quoted = names.map((name) => JSON.stringify(name));
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}
