/**
 * Helper functions for building the builder chain that describes an endpoint.
 */

import type { ParsedEndpoint } from "../parser/types";
import { getSchemaRefName } from "./schema-utils";
import type { GenerateOptions } from "./types";

/**
 * Build the chain describing an endpoint.
 *
 * It opens with the verb that reaches the endpoint, which is what says whether
 * it reads or writes. A slot carrying a schema takes it directly; one carrying
 * only a type takes a type argument, which is how an endpoint of an API that
 * publishes no usable schema is described.
 */
export function buildEndpointChain(
  address: string,
  schemaConfig: string[],
  varsType: string | null,
  responseType: string,
): string {
  const responseSchema = findConfig(schemaConfig, "response");
  const variablesSchema = findConfig(schemaConfig, "variables");

  let chain = address;

  /* A schema is preferred wherever there is one: it carries the type and
     validates the call, where a type argument only carries the type. */
  if (variablesSchema) {
    chain += `.variables(${variablesSchema})`;
  } else if (varsType && varsType !== "undefined") {
    chain += `.variables<${varsType}>()`;
  }

  if (responseSchema) {
    chain += `.response(${responseSchema})`;
  } else if (responseType !== "unknown") {
    chain += `.response<${responseType}>()`;
  }

  return chain;
}

function findConfig(config: string[], key: string): string | null {
  const entry = config.find((c) => c.startsWith(`${key}:`));
  return entry ? entry.slice(key.length + 1).trim() : null;
}

/**
 * Does the chain describe the response with a schema rather than a type?
 *
 * The two are exclusive: a slot given a schema takes it directly and names no
 * type, so a type imported for a schema-described response would go unused.
 */
export function describesResponseWithSchema(
  ep: ParsedEndpoint,
  options: GenerateOptions,
  schemaImports: Set<string>,
): boolean {
  if (!options.generateSchemas || options.validation === "none") return false;
  const responseRef = getSchemaRefName(ep.responseSchema);
  return responseRef !== null && schemaImports.has(responseRef);
}

/**
 * Is a runtime schema actually emitted for this source?
 *
 * `generateSchemas` asks for a schemas file; `validation: "none"` makes that
 * file hold types instead. Only both together produce something a chain can
 * validate against, and only then is a `XSchema` symbol importable.
 */
export function emitsSchemas(options: GenerateOptions): boolean {
  return options.generateSchemas === true && options.validation !== "none";
}
