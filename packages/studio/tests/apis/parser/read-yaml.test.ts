/**
 * Studio reads a specification's YAML as `yaml`'s own `parse` does — the
 * same values, the same first error at the same place — but looks for a key
 * named twice in time that grows with the keys: `parse` compares each key of
 * a mapping with every key before it, so a pasted mapping of forty thousand
 * keys took seconds.
 */

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { readYaml } from "../../../src/apis/parser/read-yaml";

/* A second or two on an idle machine; a loaded one may take several times that. */
const TIMED_TEST_MS = 30_000;

function outcome(read: (text: string) => unknown, text: string): unknown {
  try {
    return { value: read(text) };
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

describe("readYaml", () => {
  it.each([
    ["a mapping", "openapi: 3.1.0\ninfo:\n  title: Pets\n  version: '1'\n"],
    ["flow collections", "a: {b: 1, c: [1, 2, {d: e}]}\n"],
    ["anchors and aliases", "base: &b {x: 1}\nother: *b\n"],
    ["scalars of every kind", "n: 1\nf: 1.5\nb: true\nz: null\ns: 'text'\nhex: 0x1F\n"],
    ["a key named twice", "a: 1\nb: 2\na: 3\n"],
    ["a key named twice in a nested mapping", "a:\n  x: 1\n  x: 2\nb: 3\n"],
    ["a key named twice in a flow mapping", "a: {x: 1, x: 2}\n"],
    ["keys of the same value in different types", "1: one\n'1': text\n"],
    ["a key named twice, after an earlier one in another mapping", "a:\n  x: 1\n  x: 2\na: 3\n"],
    ["two not-a-number keys, which no comparison finds equal", ".nan: 1\n.nan: 2\n"],
    ["a merge key twice", "<<: {a: 1}\n<<: {b: 2}\n"],
    ["a syntax error", "a: [1, 2\nb: 3\n"],
    ["a syntax error after a key named twice", "a: 1\na: 2\nb: [1\n"],
    ["a key named twice after a syntax error", "a: [1\nb: 1\nb: 2\n"],
    ["two documents", "a: 1\n---\nb: 2\n"],
    ["a key named twice on a long line", `${"k".repeat(70)}: 1\n${"k".repeat(70)}: 2\n`],
    ["a key named twice after a directive with no document start", "%YAML 1.2\na: 1\na: 2\n"],
    ["two empty explicit keys", "?\n: 1\n?\n: 2\n"],
    ["an empty explicit key after one with an anchor", "? &x\n: 1\n?\n: 2\n"],
    ["an empty explicit key after one with a tag", "? !!null\n: 1\n?\n: 2\n"],
    ["a key named twice with no value", "a: 1\na\n"],
    ["a key named twice in an unterminated flow mapping", "{a: 1, a: 2\n"],
    ["a key named twice in the first of two documents", "a: 1\na: 2\n---\nb: 1\n"],
    ["a key named twice in the second of two documents", "a: 1\n---\nb: 1\nb: 2\n"],
    ["an ordered map that names a key twice", "%YAML 1.1\n---\nx: !!omap\n  - a: 1\n  - a: 2\n"],
    ["keys zero and minus zero", "0: a\n-0: b\n"],
    ["an empty text", ""],
  ])("reads %s as yaml's parse does", (_, text) => {
    expect(outcome(readYaml, text)).toEqual(outcome((source) => parse(source), text));
  });

  it(
    "reads a mapping four times as long in about four times the time, not sixteen",
    () => {
      const [short, long] = [mapping(6_250), mapping(25_000)];
      readYaml(mapping(5_000));

      const ratio = timeRatio(
        () => readYaml(short),
        () => readYaml(long),
      );

      expect(ratio).toBeLessThan(8);
    },
    TIMED_TEST_MS,
  );

  it(
    "finds a key named twice at the end of a mapping in time that grows with it as well",
    () => {
      const repeated = (keys: number) => `${mapping(keys)}\n  k7: 2\n`;
      const [short, long] = [repeated(6_250), repeated(25_000)];
      expect(() => readYaml(long)).toThrow(/^Map keys must be unique at line 25002, column 3/);

      const ratio = timeRatio(
        () => expect(() => readYaml(short)).toThrow(),
        () => expect(() => readYaml(long)).toThrow(),
      );

      expect(ratio).toBeLessThan(8);
    },
    TIMED_TEST_MS,
  );
});

function mapping(keys: number): string {
  return `x:\n${Array.from({ length: keys }, (_, n) => `  k${n}: 1`).join("\n")}`;
}

/* How many times longer the long run takes than the short one, each the
   fastest of a few, the two taken in turn: the cost of the reading, not of
   a busy machine's pauses, which slow both alike. */
function timeRatio(short: () => void, long: () => void, runs = 5): number {
  let shortest = Number.POSITIVE_INFINITY;
  let longest = Number.POSITIVE_INFINITY;
  for (let n = 0; n < runs; n++) {
    shortest = Math.min(shortest, timed(short));
    longest = Math.min(longest, timed(long));
  }
  return longest / shortest;
}

function timed(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}
