/**
 * Helper functions for building the builder chain that describes an endpoint.
 */

import type { GeneratorSettings } from "./types";

/** What an endpoint's chain is made of. */
export interface EndpointChain {
  /** The builder the chain starts from: `endpoint`, or `stream` for server-sent events. */
  head: "endpoint" | "stream";
  /** Where the endpoint is: `endpoint.get(":id")`. */
  address: string;
  /**
   * The closure placing the variables on the wire, for an endpoint its verb
   * cannot address alone; it replaces the address.
   */
  closure: string | null;
  /**
   * Whether the endpoint reads. A closure hides its verb, so an endpoint
   * addressed by one is taken to write unless the chain says it reads.
   */
  reads?: boolean;
  /** The schema validating the variables, when there is one. */
  variablesSchema: string | null;
  /**
   * The type of the variables: the slot's type for a chain without a schema
   * for them, and the type declared beside one that has a loose schema.
   */
  variablesType: string | null;
  /** The schema validating the response, when there is one. */
  responseSchema: string | null;
  /**
   * The type of the response, for a chain without a schema for it — `null`
   * for an endpoint that answers with nothing, which resolves to `void` —
   * and the type declared beside a loose schema.
   */
  responseType: string | null;
  /** The variables sent as headers, by `headerVariablesMiddleware`. */
  headers?: readonly string[];
  /**
   * What the specification says the operation does, which the endpoint
   * carries as `.meta({ description })`: an agent's tool describes itself
   * by it, and the OpenAPI written from the definition keeps it.
   */
  description?: string | null;
}

/**
 * Build the chain describing an endpoint.
 *
 * It opens with the verb that reaches the endpoint, which is what says whether
 * it reads or writes. A slot carrying a schema takes it directly; one carrying
 * only a type takes a type argument, which is how an endpoint of an API that
 * publishes no usable schema is described.
 *
 * @param chain - The address and what fills each slot
 * @returns The chain as source text
 * @example
 * ```ts
 * buildEndpointChain({ address: 'endpoint.get("")', closure: null, variablesSchema: null, variablesType: null, responseSchema: "PetSchema", responseType: null });
 * // 'endpoint.get("").response(PetSchema)'
 * ```
 */
export function buildEndpointChain(chain: EndpointChain): string {
  /* A closure is written against its variables, so they come before it. */
  let text = chain.closure ? chain.head : chain.address;

  /* A schema is preferred wherever there is one: it carries the type and
     validates the call, where a type argument only carries the type. */
  if (chain.variablesSchema) {
    text += `.variables${typeArgument(chain.variablesType)}(${chain.variablesSchema})`;
  } else if (chain.variablesType && chain.variablesType !== "undefined") {
    text += `.variables<${chain.variablesType}>()`;
  }
  if (chain.closure) text += `.via(${chain.closure})${chain.reads ? ".reads()" : ""}`;

  /* An answer whose type is not written is still an answer: left out, the
     call would resolve to `void` although it returns what the API sent. */
  if (chain.responseSchema) {
    text += `.response${typeArgument(chain.responseType)}(${chain.responseSchema})`;
  } else if (chain.responseType !== null) {
    text += `.response<${chain.responseType}>()`;
  }
  if (chain.headers && chain.headers.length > 0) {
    const names = chain.headers.map((name) => JSON.stringify(name)).join(", ");
    text += `.use(headerVariablesMiddleware([${names}]))`;
  }
  if (chain.description) text += `.meta({ description: ${JSON.stringify(chain.description)} })`;

  return text;
}

/**
 * Is a runtime schema actually emitted for this source?
 *
 * `generateSchemas` asks for a schemas file; `validation: "none"` makes that
 * file hold types instead. Only both together produce something a chain can
 * validate against, and only then is a `XSchema` symbol importable.
 *
 * @param options - The import's settings
 * @returns Whether a validator writes schemas
 * @example
 * ```ts
 * emitsSchemas({ generateSchemas: true, validation: "zod" }); // true
 * ```
 */
export function emitsSchemas(options: GeneratorSettings): boolean {
  return options.generateSchemas === true && options.validation !== "none";
}

/* A declared type beside a schema: the schema validates, the type says what
   the slot holds, without the index signature a loose object adds. */
function typeArgument(type: string | null): string {
  return type === null || type === "unknown" || type === "undefined" ? "" : `<${type}>`;
}
