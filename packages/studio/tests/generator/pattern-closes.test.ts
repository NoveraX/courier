/**
 * A pattern is taken only when the literal it is written as ends where the
 * pattern does, read as JavaScript reads the call it is written into — its
 * classes, its escapes, its line breaks, and a `/*` that would open a
 * comment instead — and every pattern that compiles is one that does.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { patternCloses } from "../../src/apis/generator/pattern-closes";
import { patternLiteral } from "../../src/apis/generator/pattern-literal";

/* Every string of up to `longest` of the characters given. */
function strings(alphabet: readonly string[], longest: number): string[] {
  const all = [""];
  let level = [""];
  for (let length = 1; length <= longest; length++) {
    level = level.flatMap((prefix) => alphabet.map((char) => prefix + char));
    all.push(...level);
  }
  return all;
}

/* What opens, closes or escapes a literal or a class, five at a time; with every line terminator, four. */
function sources(): string[] {
  const breaks = ["\r", String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
  return [
    ...strings(["[", "]", "\\", "/", "*", "\n", "a", "("], 5),
    ...strings(["[", "]", "\\", "/", "\n", "a", ...breaks], 4),
  ];
}

/*
 * The regular expression JavaScript reads as the argument of a call written
 * with the literal, or `null` when it reads none: a literal left open is an
 * error the scanner reports, though it then goes on with the text it has.
 */
function literalRead(literal: string): string | null {
  let failed = false;
  const text = `check(${literal});run()`;
  const scanner = ts.createScanner(
    ts.ScriptTarget.ESNext,
    true,
    ts.LanguageVariant.Standard,
    text,
    () => {
      failed = true;
    },
  );
  scanner.scan();
  scanner.scan();
  const slash = scanner.scan();
  if (slash !== ts.SyntaxKind.SlashToken && slash !== ts.SyntaxKind.SlashEqualsToken) return null;
  scanner.reScanSlashToken();
  return failed ? null : scanner.getTokenText();
}

function compiles(source: string, flags: string): boolean {
  try {
    new RegExp(source, flags);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

describe("patternCloses", () => {
  it("closes a class and an escape where JavaScript does", () => {
    expect(patternCloses("")).toBe(true);
    expect(patternCloses("^[a-z/]+$")).toBe(true);
    expect(patternCloses("[\\]]")).toBe(true);
    expect(patternCloses("[[]")).toBe(true);
    expect(patternCloses("a\\\\")).toBe(true);
    expect(patternCloses("[")).toBe(false);
    expect(patternCloses("[\\]")).toBe(false);
    expect(patternCloses("a\\")).toBe(false);
    expect(patternCloses("\\\\\\")).toBe(false);
    expect(patternCloses("*a")).toBe(false);
    expect(patternCloses("\\*a")).toBe(true);
  });

  it("takes exactly the patterns whose literal ends where they do, with either flag", () => {
    let closing = 0;
    let open = 0;
    for (const source of sources()) {
      for (const unicode of [false, true]) {
        const literal = patternLiteral({ source, unicode });

        expect(literalRead(literal) === literal).toBe(patternCloses(source));
      }
      if (patternCloses(source)) closing++;
      else open++;
    }

    expect(closing).toBeGreaterThan(5_000);
    expect(open).toBeGreaterThan(5_000);
  });

  it("takes every pattern that compiles", () => {
    const compiling = sources().filter((source) => compiles(source, "") || compiles(source, "u"));

    expect(compiling.length).toBeGreaterThan(1_000);
    expect(compiling.filter((source) => !patternCloses(source))).toEqual([]);
  });
});
