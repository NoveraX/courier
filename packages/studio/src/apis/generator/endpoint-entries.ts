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
import { isEventStream } from "./response-reading";

/* Said of a stream the API serves, which the proxy does not open for a page. */
const STREAM_NOTE =
  "A stream the API serves: a direct caller opens it. The proxy serves only the streams this app implements.";

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
 * What an endpoint's comment says: its description, and what only a direct
 * caller can do with it — send a body of bytes, or open a stream of events
 * the API serves.
 */
function comment(ep: ParsedEndpoint, context: EndpointContext): string {
  const note =
    requestBodyKind(ep, context.spec) === "bytes"
      ? BYTES_NOTE
      : isEventStream(ep)
        ? STREAM_NOTE
        : null;
  return [ep.description, note].filter(Boolean).join(" — ");
}
