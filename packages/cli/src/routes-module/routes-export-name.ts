/* What separates the words of a source's name that an identifier cannot hold. */
const NOT_IN_A_NAME = /[^A-Za-z0-9_$]+/;
const LEADING_DIGIT = /^[0-9]/;

/**
 * The name the routes module exports a source's routes under: the source's
 * name with `Routes` after it, its words joined as one identifier when the
 * name is not one already.
 *
 * @param source - The source's name, as courier.config keys it
 * @returns The export's name; `null` for a name that holds no word
 * @example
 * ```ts
 * routesExportName("my-api"); // → "myApiRoutes"
 * routesExportName("2fa"); // → "_2faRoutes"
 * ```
 */
export function routesExportName(source: string): string | null {
  const words = source.split(NOT_IN_A_NAME).filter((word) => word !== "");
  if (words.length === 0) return null;
  const joined = words.map((word, index) => (index === 0 ? word : capitalized(word))).join("");
  return `${LEADING_DIGIT.test(joined) ? "_" : ""}${joined}Routes`;
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
