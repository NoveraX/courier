/**
 * The entries of an `endpoints` object, as a group file and a flat source
 * both write them.
 */

import type { ParsedEndpoint, ParsedSchema } from "../parser/types";
import { buildEndpointDefinition } from "./build-endpoint";
import type { EndpointContext } from "./endpoint-context";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";

/**
 * Write one line per endpoint, each after its description when comments are
 * on. The context records what the definitions use, so the file's imports
 * are built from it afterwards.
 *
 * @param endpoints - The endpoints, in order
 * @param context - The file they are written into
 * @param extracted - The types extracted from these endpoints, by name
 * @returns The lines, indented to sit inside `endpoints: { … }`
 * @example
 * ```ts
 * endpointEntries(group.endpoints, context, extracted);
 * // ['    getPet: endpoint.get(":petId").variables<{ petId: number }>().response(PetSchema),']
 * ```
 */
export function endpointEntries(
  endpoints: readonly ParsedEndpoint[],
  context: EndpointContext,
  extracted: Readonly<Record<string, ParsedSchema>>,
): string[] {
  const lines: string[] = [];
  for (const ep of endpoints) {
    if (context.options.includeComments && ep.description) {
      lines.push(`    /** ${jsdocText(ep.description)} */`);
    }
    lines.push(`    ${objectKey(ep.name)}: ${buildEndpointDefinition(ep, context, extracted)},`);
  }
  return lines;
}
