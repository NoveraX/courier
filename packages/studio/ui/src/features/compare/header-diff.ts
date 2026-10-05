/** How a header differs between the two responses. */
export type HeaderChange = "same" | "changed" | "added" | "removed";

/** A header of either response, with its value on each side. */
export interface HeaderRow {
  name: string;
  a: string | null;
  b: string | null;
  change: HeaderChange;
}

/**
 * Every header either response had, by name, with its value on each side
 * and how it changed from A to B.
 *
 * @param a - The left response's headers
 * @param b - The right response's headers
 * @returns The headers, alphabetically
 * @example
 * ```ts
 * headerDiff({ etag: "1" }, { etag: "2", age: "3" }); // [{ name: "age", change: "added", … }, { name: "etag", change: "changed", … }]
 * ```
 */
export function headerDiff(
  a: Readonly<Record<string, string>> | undefined,
  b: Readonly<Record<string, string>> | undefined,
): HeaderRow[] {
  const left = new Map(Object.entries(a ?? {}));
  const right = new Map(Object.entries(b ?? {}));
  const names = [...new Set([...left.keys(), ...right.keys()])].sort();
  return names.map((name) => {
    const va = left.get(name) ?? null;
    const vb = right.get(name) ?? null;
    const change: HeaderChange =
      va === null ? "added" : vb === null ? "removed" : va === vb ? "same" : "changed";
    return { name, a: va, b: vb, change };
  });
}
