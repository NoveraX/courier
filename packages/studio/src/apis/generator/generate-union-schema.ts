/**
 * Code generator for a schema that is one of several alternatives.
 */

import type { ParsedSchema } from "../parser/types";
import { jsdocText } from "./jsdoc-text";
import { schemaToInterface, typeStyleFor } from "./schema-types";
import { schemaToValidation } from "./schema-utils";
import type { GeneratorSettings } from "./types";

/** Declare a schema that is one of several alternatives. */
export function generateUnionSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GeneratorSettings,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  if (options.generateTypes) {
    lines.push(`export type ${name} = ${schemaToInterface(schema, typeStyleFor(options))}`);
  }
  if (options.generateSchemas && options.validation !== "none") {
    lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
  }
  lines.push("");
}
