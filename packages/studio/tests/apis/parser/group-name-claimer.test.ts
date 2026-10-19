/**
 * The group names of one specification, each handed to one group: numbered
 * from 2 when taken, cut so a name and its number stay within the 128
 * characters a folder's name is made from, and as fast for the thousandth
 * claim of a name as for the first.
 */
import { describe, expect, it } from "vitest";

import { MAX_NAME_LENGTH } from "../../../src/apis/max-name-length";
import { groupNameClaimer } from "../../../src/apis/parser/group-name-claimer";
import { seededRandom } from "../../helpers/seeded-random";

/* The smallest number from 2 up whose name is free, searched from 2 every time. */
function claimedFromTwo(name: string, taken: Set<string>): string {
  const numbered = (number: string) => `${name.slice(0, MAX_NAME_LENGTH - number.length)}${number}`;
  let claimed = numbered("");
  for (let number = 2; taken.has(claimed); number += 1) claimed = numbered(String(number));
  taken.add(claimed);
  return claimed;
}

describe("groupNameClaimer", () => {
  it("takes a name as it is, then numbers it from 2", () => {
    const claim = groupNameClaimer();

    expect([claim("pets"), claim("pets"), claim("pets"), claim("store")]).toEqual([
      "pets",
      "pets2",
      "pets3",
      "store",
    ]);
  });

  it("skips a number another name took", () => {
    const claim = groupNameClaimer();

    expect([claim("a2"), claim("a"), claim("a"), claim("a")]).toEqual(["a2", "a", "a3", "a4"]);
  });

  it("cuts a name longer than 128 characters to 128", () => {
    expect(groupNameClaimer()("a".repeat(300))).toBe("a".repeat(MAX_NAME_LENGTH));
  });

  it("cuts a numbered name before its number", () => {
    const claim = groupNameClaimer();
    const names = Array.from({ length: 10 }, () => claim("b".repeat(200)));

    expect(names[1]).toBe(`${"b".repeat(127)}2`);
    expect(names[9]).toBe(`${"b".repeat(126)}10`);
    expect(names.every((name) => name.length === MAX_NAME_LENGTH)).toBe(true);
  });

  it("gives what a search from 2 gives, and never one name twice, on 2 000 random runs", () => {
    /* Long names whose cut ends on a digit make `…12` of one name the `…1` + `2` of another. */
    const pool = ["a", "a2", "b", `${"c".repeat(126)}1`, `${"c".repeat(126)}12`, "c".repeat(127)];
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const next = seededRandom(seed);
      const claim = groupNameClaimer();
      const taken = new Set<string>();
      const asked = Array.from({ length: 1 + next(40) }, () => pool[next(pool.length)] ?? "");
      const claimed = asked.map((name) => claim(name));

      expect(claimed).toEqual(asked.map((name) => claimedFromTwo(name, taken)));
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(claimed.every((name) => name.length <= MAX_NAME_LENGTH)).toBe(true);
    }
  });

  it("claims one name 100 000 times", () => {
    const claim = groupNameClaimer();
    let last = "";
    for (let at = 0; at < 100_000; at += 1) last = claim("pets");

    expect(last).toBe("pets100000");
  });
});
