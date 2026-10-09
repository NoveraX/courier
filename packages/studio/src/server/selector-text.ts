import type { CourierImportSelector } from "@noverax/courier/config";

/** The lists a selector holds, in the order the docs give them and a config writes them. */
export const SELECTOR_KEYS = ["tags", "paths", "operationIds"] as const;

/**
 * An import's `include` or `exclude` as a config writes it: an object of
 * the lists it holds, each value quoted the way the caller quotes strings.
 *
 * @param selector - The endpoints it names, by tag, path and operationId
 * @param quote - Quotes one string as the config around it does
 * @returns The object's text, on one line
 * @example
 * ```ts
 * selectorText({ tags: ["pets"], operationIds: ["getUser"] }, JSON.stringify);
 * // → '{ tags: ["pets"], operationIds: ["getUser"] }'
 * ```
 */
export function selectorText(
  selector: CourierImportSelector,
  quote: (value: string) => string,
): string {
  const lists = SELECTOR_KEYS.flatMap((key) => {
    const values = selector[key];
    return values === undefined ? [] : [`${key}: [${values.map(quote).join(", ")}]`];
  });
  return `{ ${lists.join(", ")} }`;
}
