/**
 * Naming utilities: camelCase, PascalCase, transliteration, endpoint name generation.
 */

const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(str: string): string {
  let result = "";
  for (const ch of str) {
    const lower = ch.toLowerCase();
    if (CYRILLIC_MAP[lower] !== undefined) {
      const mapped = CYRILLIC_MAP[lower];
      result += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    } else {
      result += ch;
    }
  }
  return result;
}

/** Convert string to a safe camelCase JS identifier. */
export function toCamelCase(str: string): string {
  const transliterated = transliterate(str);

  // All-uppercase abbreviation (SSH, API, IP, AI, VPC) → lowercase
  if (/^[A-Z][A-Z0-9]*$/.test(transliterated)) return transliterated.toLowerCase();

  return transliterated
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

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
 * Normalize a name that will be emitted as a binding — an `import { x }`, an
 * `export const x`, a shorthand property — rather than as an object key.
 */
export function toBindingName(name: string): string {
  const camel = toCamelCase(name);
  if (!camel) return "group";
  if (RESERVED_WORDS.has(camel)) return `${camel}Group`;
  return /^\d/.test(camel) ? `_${camel}` : camel;
}

/** Normalize a schema/type name into a valid JS identifier (PascalCase). */
export function toSafeIdentifier(name: string): string {
  const camel = toCamelCase(name);
  if (!camel) return "Unknown";
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toPascal(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Generate endpoint name from method + path when no operationId */
export function generateEndpointName(method: string, path: string): string {
  const segments = path.split("/").filter((s) => s && !s.startsWith("{") && !s.startsWith(":"));
  const lastSegment = segments.pop() ?? "";
  const isPlural = lastSegment.endsWith("s");

  const hasPathParam = path.includes("{") || path.includes(":");

  if (method === "get" && !hasPathParam) return `getAll${!isPlural ? toPascal(lastSegment) : ""}`;
  if (method === "get" && hasPathParam) return `getById`;
  if (method === "post") return `create`;
  if (method === "put" || method === "patch") return `update`;
  if (method === "delete") return `remove`;

  return toCamelCase(`${method}_${lastSegment}`);
}
