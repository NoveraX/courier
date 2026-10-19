/**
 * The name each group is imported under in one module: the name it would
 * like, or — when the module binds that already, or another group took it
 * — the first of `${preferred}_2`, `${preferred}_3`… that is free. An
 * OpenAPI 3.2 tag "pets group" around "pets" made a parent file that
 * imported `pets as petsGroup` and declared `petsGroup` itself.
 *
 * @param preferred - The name each group would like, by the group's name, in the order they are imported
 * @param bound - Every other name the module binds
 * @returns The name each group is imported under, by the group's name
 * @example
 * ```ts
 * moduleLocalNames(new Map([["pets", "petsGroup"]]), new Set(["petsGroup"])); // → pets → "petsGroup_2"
 * ```
 */
export function moduleLocalNames(
  preferred: ReadonlyMap<string, string>,
  bound: ReadonlySet<string>,
): Map<string, string> {
  const taken = new Set(bound);
  const locals = new Map<string, string>();
  for (const [group, wanted] of preferred) {
    const local = freeName(wanted, taken);
    taken.add(local);
    locals.set(group, local);
  }
  return locals;
}

/**
 * A name free of every name taken: the one wanted, or the first numbered one.
 *
 * @param wanted - The name wanted
 * @param taken - The names a module binds already
 * @returns The name
 * @example
 * ```ts
 * freeName("petsGroup", new Set(["petsGroup", "petsGroup_2"])); // → "petsGroup_3"
 * ```
 */
export function freeName(wanted: string, taken: ReadonlySet<string>): string {
  let local = wanted;
  for (let number = 2; taken.has(local); number += 1) local = `${wanted}_${number}`;
  return local;
}
