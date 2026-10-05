import { formatImportSnippet } from "./format-import-snippet";
import type { ImportDeclarationParts } from "./import-declaration-parts";
import type { ImportDeclaration } from "./write-types";

/**
 * The lines to add by hand for what the config must still declare.
 *
 * @param name - The import's name
 * @param parts - What the config must still declare
 * @returns The import line, the `sources` entry and the `imports` entry, as text
 * @example
 * ```ts
 * declarationText("pets", parts).source?.entry; // → "pets,"
 * ```
 */
export function declarationText(name: string, parts: ImportDeclarationParts): ImportDeclaration {
  const binding = parts.source?.binding;
  const source = parts.source && {
    importLine: `import { ${parts.source.binding} } from ${JSON.stringify(parts.source.specifier)};`,
    entry: binding === name ? `${binding},` : `${JSON.stringify(name)}: ${binding},`,
  };
  const importEntry = parts.importEntry && formatImportSnippet(name, parts.importEntry);
  return {
    configFile: parts.configFile,
    source,
    importEntry,
    ...(parts.leftOut > 0 && { leftOut: parts.leftOut }),
  };
}
