import { declarationText } from "./declaration-text";
import { type DeclarationInput, importDeclarationParts } from "./import-declaration-parts";
import type { ImportDeclaration } from "./write-types";

/**
 * Describe what the config must still declare for an import Studio just
 * wrote, as the lines to add by hand: the import of the generated source
 * and its `sources` entry while `sources` does not declare it, and the
 * `imports` entry while `imports` does not name the import — see
 * {@link importDeclarationParts} for how each is worked out.
 *
 * The endpoints the write left out are counted, because the `imports` entry
 * cannot keep a selection: regenerating from it, as an update does,
 * generates every endpoint in the specification.
 *
 * @param input - The import's name, the write, the config and the project root
 * @returns What is left to declare; none once the config declares both
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 *
 * @example
 * ```ts
 * describeImportDeclaration({ name: "pets", body, loaded, root });
 * // → { configFile: "courier.config.ts",
 * //     source: { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," },
 * //     importEntry: '  "pets": {\n    importType: "url",\n …',
 * //     leftOut: 3 }
 * ```
 */
export function describeImportDeclaration(input: DeclarationInput): ImportDeclaration | undefined {
  const parts = importDeclarationParts(input);
  return parts && declarationText(input.name, parts);
}
