import { hasControlCharacter } from "./has-control-character";
import { InvalidImportError } from "./invalid-import-error";

/** The longest name an import may have. */
export const MAX_NAME_LENGTH = 128;

/**
 * Refuse an import name Studio cannot write safely: an empty one, one
 * longer than {@link MAX_NAME_LENGTH}, or one holding a line break, a line
 * or paragraph separator or another control character — the name is
 * written into every generated file's first line, where such a character
 * would end the comment and turn the rest of the name into code.
 *
 * @param importName - The import's key under `imports`
 * @throws {InvalidImportError} When the name is refused
 * @example
 * ```ts
 * checkImportName("pets"); // passes
 * checkImportName("pets\nexport const x = 1"); // throws
 * ```
 */
export function checkImportName(importName: string): void {
  if (importName.trim() === "")
    throw new InvalidImportError("importName", importName, "it is empty");
  if (importName.length > MAX_NAME_LENGTH) {
    throw new InvalidImportError(
      "importName",
      importName.slice(0, 40),
      `it is longer than ${MAX_NAME_LENGTH} characters`,
    );
  }
  if (hasControlCharacter(importName)) {
    throw new InvalidImportError(
      "importName",
      importName,
      "it holds a line break or another control character",
    );
  }
}
