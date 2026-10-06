/**
 * Words that may name an object property but may not name a binding.
 * A spec whose endpoints carry no tag is grouped under `default`, so the
 * generated `import { default }` and `export const default` were rejected by
 * the parser before any type checker ever saw them.
 */
const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/**
 * Names the generated files import or declare themselves: from
 * `@noverax/courier`, the validation libraries, and `requireEnv`. A group or
 * a source named like one would be declared twice in the file that also
 * uses it, and that file would not compile.
 */
const GENERATED_IDENTIFIERS = new Set([
  "ark",
  "authMiddleware",
  "courier",
  "createCaller",
  "createProxyCaller",
  "defineApi",
  "defineGroup",
  "endpoint",
  "formBody",
  "formQuery",
  "headerVariablesMiddleware",
  "requireEnv",
  "stream",
  "type",
  "v",
  "z",
]);

/**
 * Tell whether a camel-cased name may not be emitted as a binding as it is:
 * a reserved word, or a name the generated files use themselves.
 *
 * @param name - A camel-cased name
 * @returns `true` when the name needs a suffix to be a binding
 * @example
 * ```ts
 * isReservedBinding("default"); // true
 * isReservedBinding("courier"); // true
 * isReservedBinding("pets"); // false
 * ```
 */
export function isReservedBinding(name: string): boolean {
  return RESERVED_WORDS.has(name) || GENERATED_IDENTIFIERS.has(name);
}
