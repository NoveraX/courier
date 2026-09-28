/**
 * What an endpoint's definition is written against, and what it uses.
 *
 * A file of endpoints imports from the schemas module beside it. Guessing
 * that import from the endpoints' schemas missed what the chains actually
 * wrote — a validator wrapped around a list, each type of a union — and named
 * types the module never declared. Every name a definition writes is taken
 * through here instead, so the import lists exactly what the file uses.
 */

import { ownValue } from "../own-value";
import type { ParsedSchema, ParsedSpec } from "../parser/types";
import { emitsSchemas } from "./build-endpoint-helpers";
import { findCyclicSchemas } from "./cyclic-schemas";
import type { TypeStyle } from "./inline-types";
import { typeStyleFor } from "./schema-types";
import type { ResolvedGenerateOptions } from "./types";

/** The names a file's definitions use. */
export interface EndpointUses {
  /** Schema constants, by their full name: `PetSchema`. */
  readonly values: Set<string>;
  /** Type names. */
  readonly types: Set<string>;
  /** Whether a definition calls the validation library itself: `z.array(…)`. */
  validator: boolean;
  /** Whether a closure writes a url-encoded body with `formBody`. */
  formBody: boolean;
  /** Whether a closure writes query values with `formQuery`. */
  formQuery: boolean;
  /** The builders the definitions start from: `endpoint`, `stream`. */
  readonly bases: Set<"endpoint" | "stream">;
}

/** One file's endpoints, the module beside them, and what they use of it. */
export interface EndpointContext {
  readonly spec: ParsedSpec;
  readonly options: ResolvedGenerateOptions;
  /** Every schema the module beside the file declares, by name. */
  readonly declared: Readonly<Record<string, ParsedSchema>>;
  /**
   * The declared schemas that are written lazily, being on a reference
   * cycle: typed as a plain schema, they cannot be extended.
   */
  readonly lazy: ReadonlySet<string>;
  readonly uses: EndpointUses;
}

/**
 * Start writing one file's endpoints.
 *
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @param declared - The schemas the module beside the file declares
 * @returns A context that has used nothing yet
 * @example
 * ```ts
 * const context = endpointContext(spec, options, buildSchemaRecord(group, spec, extracted));
 * ```
 */
export function endpointContext(
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  declared: Readonly<Record<string, ParsedSchema>>,
): EndpointContext {
  return {
    spec,
    options,
    declared,
    lazy: emitsSchemas(options) ? findCyclicSchemas(declared) : new Set(),
    uses: {
      values: new Set(),
      types: new Set(),
      validator: false,
      formBody: false,
      formQuery: false,
      bases: new Set(),
    },
  };
}

/**
 * How an endpoint writes a type: a schema's own name when the module beside
 * it declares that type, and `unknown` when it does not — with types turned
 * off, or for a reference to a schema the specification never defines. An
 * optional field is written as the validator infers it, as the schemas file
 * writes one: written otherwise beside zod's or valibot's schema, the pair
 * did not compile under `exactOptionalPropertyTypes`.
 *
 * @param context - The file being written
 * @returns The style, recording each name it writes
 * @example
 * ```ts
 * schemaToTsType(ep.responseSchema, endpointTypeStyle(context)); // "Pet[]"
 * ```
 */
export function endpointTypeStyle(context: EndpointContext): TypeStyle {
  return {
    undefinedWhenOptional: typeStyleFor(context.options).undefinedWhenOptional,
    reference: (name) => typeName(context, name) ?? "unknown",
  };
}

/**
 * A type's name, when the module beside the file declares that type.
 *
 * @param context - The file being written
 * @param name - The schema's name
 * @returns The name, recorded as used, or `null` when nothing declares it
 * @example
 * ```ts
 * typeName(context, "ListPetsParams"); // "ListPetsParams"
 * ```
 */
export function typeName(context: EndpointContext, name: string): string | null {
  if (!context.options.generateTypes || !declares(context, name)) return null;
  context.uses.types.add(name);
  return name;
}

/**
 * The constant validating a named schema, when the module beside the file
 * declares one.
 *
 * @param context - The file being written
 * @param name - The schema's name
 * @returns `<name>Schema`, recorded as used, or `null` when there is none
 * @example
 * ```ts
 * schemaConstant(context, "Pet"); // "PetSchema"
 * ```
 */
export function schemaConstant(context: EndpointContext, name: string): string | null {
  if (!hasSchemaConstant(context, name)) return null;
  const constant = `${name}Schema`;
  context.uses.values.add(constant);
  return constant;
}

/**
 * Whether the module beside the file declares a constant validating a named
 * schema, without recording it as used.
 *
 * @param context - The file being written
 * @param name - The schema's name
 * @returns Whether `<name>Schema` can be imported
 * @example
 * ```ts
 * hasSchemaConstant(context, "Pet"); // true with a validator, false with validation "none"
 * ```
 */
export function hasSchemaConstant(context: EndpointContext, name: string): boolean {
  return emitsSchemas(context.options) && declares(context, name);
}

function declares(context: EndpointContext, name: string): boolean {
  return ownValue(context.declared, name) !== undefined;
}
