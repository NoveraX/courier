/**
 * The entries of an `endpoints` object, as a group file and a flat source
 * both write them.
 */

import { ownValue } from "../own-value";
import type { ParsedEndpoint } from "../parser/types";
import { buildEndpointDefinition } from "./build-endpoint";
import type { EndpointContext } from "./endpoint-context";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";
import { requestBodyKind } from "./request-body";

/* Said of an endpoint taking bytes, which only a direct caller can send. */
const BYTES_NOTE =
  "Sends the Blob as the body, as it is. The proxy carries JSON and FormData only, so call it from a direct caller.";

/**
 * Write one line per endpoint, each after its description when comments are
 * on. The context records what the definitions use, so the file's imports
 * are built from it afterwards.
 *
 * @param endpoints - The endpoints, in order
 * @param context - The file they are written into
 * @param paramsTypes - The type naming each endpoint's variables, by the endpoint's name
 * @returns The lines, indented to sit inside `endpoints: { … }`
 * @example
 * ```ts
 * endpointEntries(group.endpoints, context, paramsTypes);
 * // ['    getPet: endpoint.get(":petId").variables<{ petId: number }>().response(PetSchema),']
 * ```
 */
export function endpointEntries(
  endpoints: readonly ParsedEndpoint[],
  context: EndpointContext,
  paramsTypes: Readonly<Record<string, string>>,
): string[] {
  const lines: string[] = [];
  for (const ep of endpoints) {
    const doc = context.options.includeComments ? comment(ep, context) : "";
    if (doc) lines.push(`    /** ${jsdocText(doc)} */`);
    lines.push(
      `    ${objectKey(ep.name)}: ${buildEndpointDefinition(ep, context, ownValue(paramsTypes, ep.name))},`,
    );
  }
  return lines;
}

/**
 * What an endpoint's comment says: its description, and for a body of bytes
 * that the proxy cannot carry them.
 */
function comment(ep: ParsedEndpoint, context: EndpointContext): string {
  if (requestBodyKind(ep, context.spec) !== "bytes") return ep.description;
  return [ep.description, BYTES_NOTE].filter(Boolean).join(" — ");
}
