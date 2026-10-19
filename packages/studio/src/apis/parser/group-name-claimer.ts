import { MAX_NAME_LENGTH } from "../max-name-length";

/**
 * Hand out the group names of one specification, each to one group: a name
 * as it is the first time it is asked for, then with the first number from
 * 2 up that no group took. A name is cut so that it, its number included,
 * stays within {@link MAX_NAME_LENGTH} — the longest name a group's folder
 * is made from — and asking for a name again and again takes as long as
 * asking for each once.
 *
 * @returns A function that claims the name a group asks for and returns
 *   the one it gets
 * @example
 * ```ts
 * const claim = groupNameClaimer();
 * claim("pets"); // → "pets"
 * claim("pets"); // → "pets2"
 * claim("a".repeat(200)).length; // → 128
 * ```
 */
export function groupNameClaimer(): (name: string) => string {
  const taken = new Set<string>();
  /* The number a name's next claim starts from: every one below it is taken, as names are never given back. */
  const nextNumber = new Map<string, number>();
  return function claim(name: string): string {
    let claimed = numbered(name, "");
    if (taken.has(claimed)) {
      let number = nextNumber.get(name) ?? 2;
      while (taken.has(numbered(name, String(number)))) number += 1;
      claimed = numbered(name, String(number));
      nextNumber.set(name, number + 1);
    }
    taken.add(claimed);
    return claimed;
  };
}

/* The name with its number, cut before the number to fit. Names are ASCII, so a cut never splits a character. */
function numbered(name: string, number: string): string {
  return `${name.slice(0, MAX_NAME_LENGTH - number.length)}${number}`;
}
