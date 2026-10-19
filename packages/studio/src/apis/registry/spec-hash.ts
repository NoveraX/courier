/**
 * Spec hashing and change detection.
 */

import { createHash } from "node:crypto";
import type { ParsedSpec } from "../parser/types";
import { jsonText } from "./json-text";

/**
 * A hash of the parts of a specification an import is generated from, for
 * telling a changed one from an unchanged one. It is the hash of their JSON
 * text, however deep they nest: past the depth JSON.stringify's recursion
 * goes, the same text is written without it, so every hash recorded stays.
 *
 * @param spec - The parsed specification
 * @returns The hash, 32 hexadecimal digits
 * @example
 * ```ts
 * computeSpecHash(parseSpec(text)); // → "b546741a2b9043367c0fbe7c5be128ea"
 * ```
 */
export function computeSpecHash(spec: ParsedSpec): string {
  const content = jsonText({
    title: spec.title,
    version: spec.version,
    groups: spec.groups,
    schemas: spec.schemas,
    securitySchemes: spec.securitySchemes,
  });
  return createHash("sha256")
    .update(content ?? "")
    .digest("hex")
    .slice(0, 32);
}
