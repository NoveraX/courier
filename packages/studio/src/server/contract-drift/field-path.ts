/** A field's path, split into the object it belongs to and its own name. */
export interface FieldPath {
  /** The object: `""` for the answer, `seller`, `items[]` */
  readonly within: string;
  /** The field's name; `undefined` when the path names the answer, or a list's items, not a field */
  readonly key: string | undefined;
}

/**
 * Split a field's path — `seller.rating`, `items[].price` — into the
 * object it belongs to and its name. A list's items belong to the list:
 * `items[]` names no field.
 *
 * @param path - The path, as an answer's shape writes it
 * @returns The object and the name
 * @example
 * ```ts
 * splitFieldPath("items[].price"); // { within: "items[]", key: "price" }
 * ```
 */
export function splitFieldPath(path: string): FieldPath {
  if (path === "" || path.endsWith("[]")) return { within: path, key: undefined };
  const dot = path.lastIndexOf(".");
  return dot === -1
    ? { within: "", key: path }
    : { within: path.slice(0, dot), key: path.slice(dot + 1) };
}

/**
 * The steps from the answer to an object: each field's name, and `[]` for
 * a list's items.
 *
 * @param within - The object's path: `""`, `seller`, `items[]`, `[].tags[]`
 * @returns The steps
 * @example
 * ```ts
 * pathSteps("orders[].items[]"); // ["orders", "[]", "items", "[]"]
 * ```
 */
export function pathSteps(within: string): string[] {
  if (within === "") return [];
  return within.split(".").flatMap((part) => {
    const lists = part.match(/(\[\])+$/)?.[0] ?? "";
    const name = part.slice(0, part.length - lists.length);
    return [
      ...(name === "" ? [] : [name]),
      ...Array.from({ length: lists.length / 2 }, () => "[]"),
    ];
  });
}
