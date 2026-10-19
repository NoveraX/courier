import { ARKTYPE_OWN_FIELDS } from "./own-fields-arktype";
import { VALIBOT_OWN_FIELDS } from "./own-fields-valibot";
import { ZOD_OWN_FIELDS } from "./own-fields-zod";
import type { GeneratorSettings } from "./types";

/**
 * The declarations of `_ownFields` a module writes when an object of it has
 * a field named like a member every object inherits, as its validation
 * library needs them; none for a library that validates nothing.
 *
 * @param validation - The validation library
 * @returns The declarations, or `null`
 * @example
 * ```ts
 * if (holdsOwnFields(schemas)) lines.push(ownFieldsHelper(options.validation) ?? "");
 * ```
 */
export function ownFieldsHelper(validation: GeneratorSettings["validation"]): string | null {
  if (validation === "zod") return ZOD_OWN_FIELDS;
  if (validation === "valibot") return VALIBOT_OWN_FIELDS;
  if (validation === "arktype") return ARKTYPE_OWN_FIELDS;
  return null;
}
