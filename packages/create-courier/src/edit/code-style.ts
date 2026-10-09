/** How a file writes its strings and ends its statements, so a line added to it reads as its own. */
export interface CodeStyle {
  readonly quote: '"' | "'";
  readonly semi: boolean;
}

/* A file without imports: the quote its first string is written in, and whether any line of it ends with a semicolon. */
function styleOfCode(text: string): CodeStyle {
  const code = text.replace(/^\s*\/\/.*$/gm, "");
  const quote = /["']/.exec(code)?.[0];
  return { quote: quote === "'" ? "'" : '"', semi: /;\s*$/m.test(code) };
}

/**
 * How a file writes its strings and ends its statements, told by its
 * imports: the quote its first module name is written in, and whether
 * that import ends with a semicolon. A file without imports is read by its
 * first string and its line ends.
 *
 * @param text - The file
 * @returns Its style
 * @example
 * ```ts
 * codeStyleOf("import react from '@vitejs/plugin-react'\n"); // { quote: "'", semi: false }
 * ```
 */
export function codeStyleOf(text: string): CodeStyle {
  const named = /^import\b[^;]*?\bfrom\s*(["'])[^"'\n]*\1(;?)/m.exec(text);
  if (named === null) return styleOfCode(text);
  return { quote: named[1] === "'" ? "'" : '"', semi: named[2] === ";" };
}

/**
 * A string written in a file's quote.
 *
 * @param style - The file's style
 * @param value - The string
 * @returns The literal
 * @example
 * ```ts
 * quoted({ quote: "'", semi: false }, "@noverax/courier-studio/nuxt"); // "'@noverax/courier-studio/nuxt'"
 * ```
 */
export function quoted(style: CodeStyle, value: string): string {
  return `${style.quote}${value}${style.quote}`;
}

/**
 * An import of named exports, written in a file's style.
 *
 * @param style - The file's style
 * @param names - The names imported
 * @param from - The module
 * @returns The statement
 * @example
 * ```ts
 * namedImport({ quote: '"', semi: true }, ["courierStudio"], "@noverax/courier-studio/vite");
 * // 'import { courierStudio } from "@noverax/courier-studio/vite";'
 * ```
 */
export function namedImport(style: CodeStyle, names: readonly string[], from: string): string {
  return `import { ${names.join(", ")} } from ${quoted(style, from)}${style.semi ? ";" : ""}`;
}
