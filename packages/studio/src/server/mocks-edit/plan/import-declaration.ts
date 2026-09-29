import { quoteString } from "./quote-string";
import type { FileStyle } from "./types";

/** A name to import, and the local name it is bound to. */
export interface ImportedName {
  imported: string;
  local: string;
}

/** What an import declaration binds: named exports, or the default export. */
export type ImportClause =
  | { names: readonly ImportedName[] }
  | { defaultLocal: string }
  | { namespaceLocal: string };

/**
 * Write an import declaration in a file's style: `import { a, b as c } from
 * "specifier"` or `import local from "specifier"`, in its quote, ending with
 * a semicolon when its statements do.
 *
 * @param clause - The names to import, or the local name of the default export
 * @param specifier - The module to import from
 * @param style - The file's style
 * @returns The declaration's text
 *
 * @example
 * ```ts
 * importDeclaration({ defaultLocal: "courierConfig" }, "./courier.config", style);
 * // → import courierConfig from "./courier.config";
 * ```
 */
export function importDeclaration(
  clause: ImportClause,
  specifier: string,
  style: FileStyle,
): string {
  const bound =
    "names" in clause
      ? `{ ${clause.names.map(nameText).join(", ")} }`
      : "namespaceLocal" in clause
        ? `* as ${clause.namespaceLocal}`
        : clause.defaultLocal;
  const declaration = `import ${bound} from ${quoteString(specifier, style.quote)}`;
  return style.semicolons ? `${declaration};` : declaration;
}

function nameText({ imported, local }: ImportedName): string {
  return imported === local ? imported : `${imported} as ${local}`;
}
