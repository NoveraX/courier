/**
 * A socket event's list field whose every item passes `isItem`, or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @param isItem - Tells an item of the list's type
 * @returns The list, or `undefined` when it is not a list or one item fails
 * @example
 * ```ts
 * readList(["a", "b"], (item): item is string => typeof item === "string"); // → ["a", "b"]
 * ```
 */
export function readList<TItem>(
  value: unknown,
  isItem: (item: unknown) => item is TItem,
): TItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: unknown[] = value;
  return items.every(isItem) ? items : undefined;
}
