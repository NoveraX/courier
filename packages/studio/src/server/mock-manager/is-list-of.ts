/**
 * Whether a value a mock's worker sent is a list whose every item passes.
 *
 * @param value - The value, as the worker's message carried it
 * @param isItem - The check each item must pass
 * @returns Whether it is such a list; an empty list is one
 * @example
 * ```ts
 * const isText = (item: unknown): item is string => typeof item === "string";
 * isListOf(["a", "b"], isText); // true
 * isListOf({ 0: "a" }, isText); // false
 * ```
 */
export function isListOf<TItem>(
  value: unknown,
  isItem: (item: unknown) => item is TItem,
): value is TItem[] {
  if (!Array.isArray(value)) return false;
  const items: unknown[] = value;
  return items.every(isItem);
}
