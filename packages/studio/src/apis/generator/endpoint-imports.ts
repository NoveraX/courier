/**
 * The imports of a file of endpoints: exactly what its definitions use.
 */

import type { EndpointContext } from "./endpoint-context";
import { namedStatement } from "./named-statement";
import { ownFieldsHelper } from "./own-fields-helper";
import type { ResolvedGenerateOptions } from "./types";

/** What a schema's constant adds to its name: `PetSchema` validates `Pet`. */
const SUFFIX = "Schema";

/** How each validation library is imported under the name the chains call. */
const VALIDATOR_IMPORT: Readonly<Record<string, string>> = {
  zod: `import { z } from "zod";`,
  valibot: `import * as v from "valibot";`,
  arktype: `import { type } from "arktype";`,
};

/**
 * Import what a file's endpoint definitions use, once they are all written.
 *
 * A type is imported as a type, so a project compiling with
 * `verbatimModuleSyntax` — Vite's default — accepts the file, and a bundler
 * never looks for a value the schemas module does not export. When every
 * name is a type, the whole import is `import type`, as linters ask.
 *
 * A schema the import's own module declares is imported from it rather
 * than from the module beside the file. Each module is imported once:
 * middleware the file uses besides comes in the same statement as the
 * middleware the definitions use.
 *
 * @param context - The file, after its definitions were built
 * @param middleware - Other middleware the file imports, as the source imports its auth
 * @returns The import lines, the validator's first
 * @example
 * ```ts
 * endpointImports(context);
 * // ['import { z } from "zod";', 'import { type ListPetsParams, PetSchema } from "./schemas";']
 * ```
 */
export function endpointImports(
  context: EndpointContext,
  middleware: readonly string[] = [],
): string[] {
  const { uses, options } = context;
  const lines: string[] = [];
  const middlewareNames = [
    ...middleware,
    ...(uses.headerVariables ? ["headerVariablesMiddleware"] : []),
  ];
  if (middlewareNames.length > 0) {
    lines.push(namedStatement("import", middlewareNames, "@noverax/courier/middleware"));
  }
  const validator = VALIDATOR_IMPORT[options.validation];
  if (uses.validator && validator) lines.push(validator);

  const fromShared = (name: string): boolean => context.shared.has(name);
  const isShared = (constant: string): boolean => fromShared(constant.slice(0, -SUFFIX.length));
  const values = [...uses.values];
  const types = [...uses.types];
  lines.push(
    ...schemaImport(
      values.filter((v) => !isShared(v)),
      types.filter((t) => !fromShared(t)),
      schemasModule(options, "./"),
    ),
    ...schemaImport(
      values.filter(isShared),
      types.filter(fromShared),
      schemasModule(options, "../"),
    ),
  );
  return lines;
}

/* What a file imports of one schemas module: as types alone when it uses no value of it. */
function schemaImport(values: string[], types: string[], from: string): string[] {
  if (values.length === 0 && types.length > 0) return [namedStatement("import type", types, from)];
  if (values.length === 0) return [];
  return [namedStatement("import", [...values, ...types.map((name) => `type ${name}`)], from)];
}

/**
 * The import of what a file defines its endpoints with: `courier`, the
 * definer, `formBody` when a closure writes a url-encoded body, and
 * `formQuery` when one writes query values in a style of their own.
 *
 * @param context - The file's endpoints, written
 * @param definer - `defineGroup` for a group's file, `defineApi` for a flat source's
 * @returns The import statement
 * @example
 * ```ts
 * defineImport(context, "defineGroup"); // → 'import { courier, defineGroup } from "@noverax/courier/define";'
 * ```
 */
export function defineImport(
  context: EndpointContext,
  definer: "defineGroup" | "defineApi",
): string {
  const names = [
    "courier",
    definer,
    ...(context.uses.formBody ? ["formBody"] : []),
    ...(context.uses.formQuery ? ["formQuery"] : []),
  ];
  return namedStatement("import", names, "@noverax/courier/define");
}

/**
 * The line that takes the builders a file's definitions start from out of
 * `courier()`: `endpoint`, and `stream` when a stream of events is among them.
 *
 * @param context - The file's endpoints, written
 * @returns The declaration
 * @example
 * ```ts
 * basesDeclaration(context); // → "const { endpoint, stream } = courier();"
 * ```
 */
export function basesDeclaration(context: EndpointContext): string {
  const { bases } = context.uses;
  const names =
    bases.size === 0 ? ["endpoint"] : (["endpoint", "stream"] as const).filter((b) => bases.has(b));
  return `const { ${names.join(", ")} } = courier();`;
}

/* A module declaring schemas and types: the one beside the endpoints, at
   `./`, or the import's own, at `../` from a group's folder. Its name
   follows `generateSchemas` alone: `validation: "none"` still writes
   schemas.ts, holding types. */
function schemasModule(options: ResolvedGenerateOptions, at: "./" | "../"): string {
  return `${at}${options.generateSchemas ? "schemas" : "types"}${options.importExtension}`;
}

/**
 * The declarations of `_ownFields` a file of endpoints writes after its
 * declaration, as it writes every helper of its own, when one of its
 * definitions writes an object through it. A function is called before
 * its declaration as well as after it, and an update carries the code
 * after a file's declaration into the file it merges with, so a file
 * Studio wrote before such a field was in its specification gets the
 * helper with the first call to it.
 *
 * @param context - The file's endpoints and what they use
 * @returns The lines, the last one blank, or none
 * @example
 * ```ts
 * const lines = [...declaration, "", ...ownFieldsDeclaration(context)];
 * ```
 */
export function ownFieldsDeclaration(context: EndpointContext): string[] {
  const helper = context.uses.ownFields ? ownFieldsHelper(context.options.validation) : null;
  return helper === null ? [] : [helper.trimEnd(), ""];
}
