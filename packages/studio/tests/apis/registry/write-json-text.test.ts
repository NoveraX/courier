/**
 * The text JSON.stringify writes, written without recursion: the same text
 * for every kind of value it takes, and the text of one nested deeper than
 * its recursion goes.
 */
import { describe, expect, it } from "vitest";

import { jsonText } from "../../../src/apis/registry/json-text";
import { writeJsonText } from "../../../src/apis/registry/write-json-text";
import { seededRandom } from "../../helpers/seeded-random";

function written(value: unknown): string | undefined {
  const pieces: string[] = [];
  return writeJsonText(value, (piece) => {
    pieces.push(piece);
  })
    ? pieces.join("")
    : undefined;
}

class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

const STRINGS = [
  "",
  "plain",
  'quo"te',
  "back\\slash",
  "line\nbreak",
  "\u0000\u001f\u007f",
  "\ud800",
  "\udfff alone",
  "pair 😀",
  " ",
];
const LEAVES: readonly unknown[] = [
  ...STRINGS,
  0,
  -0,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  1e21,
  5e-324,
  true,
  false,
  null,
  undefined,
  () => 1,
  Symbol("s"),
  new Date(0),
  new Number(3),
  new String("boxed"),
  new Boolean(false),
  new Point(1, 2),
  new Map([["a", 1]]),
  new Set([1]),
  new Uint8Array([1, 2]),
  { toJSON: (key: string) => `to ${key}` },
  { toJSON: "data" },
];

/* A seeded value of nested objects and lists, its leaves every kind JSON.stringify meets. */
function randomValue(next: (below: number) => number, depth: number): unknown {
  const roll = next(10);
  if (depth > 4 || roll < 4) return LEAVES[next(LEAVES.length)];
  if (roll < 7) {
    const list: unknown[] = Array.from({ length: next(4) }, () => randomValue(next, depth + 1));
    if (next(4) === 0) list[list.length + 1] = "after a hole";
    return list;
  }
  const keys = ["a", "b", "1", "10", "__proto__", "x y", 'q"', STRINGS[next(STRINGS.length)] ?? ""];
  const object: Record<string, unknown> = JSON.parse('{"__proto__": 0}');
  for (let at = next(5); at > 0; at -= 1)
    object[keys[next(keys.length)] ?? ""] = randomValue(next, depth + 1);
  return object;
}

describe("writeJsonText", () => {
  it("writes what JSON.stringify writes, on 20 000 seeded values", () => {
    for (let seed = 1; seed <= 20_000; seed += 1) {
      const value = randomValue(seededRandom(seed), 0);

      expect(written(value)).toBe(JSON.stringify(value));
    }
  });

  it("throws on an object inside itself and on a BigInt, as JSON.stringify does", () => {
    const looped: Record<string, unknown> = {};
    looped.self = { back: looped };

    expect(() => written(looped)).toThrow(TypeError);
    expect(() => written({ big: 1n })).toThrow(TypeError);
  });

  it("writes nothing for a value JSON leaves out", () => {
    expect(written(undefined)).toBeUndefined();
    expect(written(() => 1)).toBeUndefined();
  });

  it("writes a value nested 100 000 deep", () => {
    let value: unknown = "end";
    for (let depth = 0; depth < 100_000; depth += 1)
      value = depth % 2 === 0 ? { next: value } : [value];

    expect(jsonText(value)).toBe(`${'[{"next":'.repeat(50_000)}"end"${"}]".repeat(50_000)}`);
  });
});
