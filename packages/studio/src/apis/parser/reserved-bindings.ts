/**
 * Words that may name an object property but may not name a binding.
 * A spec whose endpoints carry no tag is grouped under `default`, so the
 * generated `import { default }` and `export const default` were rejected by
 * the parser before any type checker ever saw them. `eval` and `arguments`
 * are not reserved, but a module is strict, and in one they bind nothing.
 */
const RESERVED_WORDS = new Set([
  "arguments",
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
  "eval",
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
 * Globals the generated code reads: `undefined`, which a call passes for a
 * body it does not send, and `globalThis` and `Error`, by which a missing
 * variable is found and told. A binding of one — a group, a source, a
 * parameter — would take its place in the module that holds it: a
 * parameter's value would be sent as the body, or a group read for the
 * environment. A schema may still be named `Error`: it names a type.
 */
const READ_GLOBALS = new Set(["Error", "globalThis", "undefined"]);

/**
 * Tell whether a camel-cased name may not be emitted as a binding as it is:
 * a reserved word, a name the generated files use themselves, or a global
 * they read.
 *
 * @param name - A camel-cased name
 * @returns `true` when the name needs a suffix to be a binding
 * @example
 * ```ts
 * isReservedBinding("default"); // true
 * isReservedBinding("courier"); // true
 * isReservedBinding("globalThis"); // true
 * isReservedBinding("pets"); // false
 * ```
 */
export function isReservedBinding(name: string): boolean {
  return RESERVED_WORDS.has(name) || GENERATED_IDENTIFIERS.has(name) || READ_GLOBALS.has(name);
}

/* What TypeScript reads as a type of its own where a type alias is named. */
const TYPE_KEYWORDS = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
  "unknown",
]);

/**
 * Tell whether a name may not name a schema's type alias: a reserved word,
 * one of TypeScript's own types, or a name the generated files use
 * themselves, which a type alias of the same name would collide with.
 * Globals the generated code only reads as values, such as `Error`, are
 * free: a schema called `Error` is as common as any.
 *
 * @param name - A schema's name, or one a schema refers to by
 * @returns `true` when no type alias may take the name
 * @example
 * ```ts
 * isReservedTypeName("string"); // true
 * isReservedTypeName("z"); // true
 * isReservedTypeName("Error"); // false
 * ```
 */
export function isReservedTypeName(name: string): boolean {
  return RESERVED_WORDS.has(name) || GENERATED_IDENTIFIERS.has(name) || TYPE_KEYWORDS.has(name);
}
