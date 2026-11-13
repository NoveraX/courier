import { isSubpathMap } from "./resolve-import.mjs";

/* The sides an entry is put on: what a page imports, what Studio's runtime imports in a page, what a
   server does, or both — the root. */
const SIDES = ["pageEntries", "studioEntries", "serverEntries", "sharedEntries"];

/**
 * What a package's `module-sides.json` leaves unsaid of its entries: an
 * entry of its `exports` on no side, or on more than one, and a side that
 * names an entry the package does not export. A new entry cannot slip past
 * the check of a page's modules unclassified.
 *
 * @param {string} name - The package's name
 * @param {unknown} exports - The `exports` of its manifest
 * @param {Record<string, Record<string, string> | undefined>} sides - Its `module-sides.json`
 * @returns {string[]} The breaches
 * @example
 * entrySideBreaches("@noverax/courier", { ".": "./lib/index.js" }, { sharedEntries: { ".": "The root" } }); // []
 */
export function entrySideBreaches(name, exports, sides) {
  const keys = Object.keys(isSubpathMap(exports) ? exports : { ".": exports }).filter(
    (key) => key !== "./package.json",
  );
  const sided = SIDES.flatMap((side) =>
    Object.keys(sides[side] ?? {}).map((entry) => ({ side, entry })),
  );
  const breaches = [];
  for (const key of keys) {
    const on = sided.filter((each) => each.entry === key).map((each) => each.side);
    if (on.length === 0)
      breaches.push(
        `${name} exports ${key}, which its module-sides.json puts on no side: ${SIDES.join(", ")}`,
      );
    if (on.length > 1)
      breaches.push(
        `${name}'s module-sides.json puts ${key} on more than one side: ${on.join(", ")}`,
      );
  }
  for (const { side, entry } of sided) {
    if (!keys.includes(entry))
      breaches.push(
        `${name}'s module-sides.json names ${entry} in ${side}, which the package does not export`,
      );
  }
  return breaches;
}
