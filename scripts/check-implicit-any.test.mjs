/**
 * Self-test for `scripts/check-implicit-any.mjs`. Each case writes a one-file
 * project to `os.tmpdir()` and runs the checker over it: a value typed `any`
 * is reported when it is declared, read from, or handed to a place with a
 * type of its own, and left alone when it is read into `unknown`, passed
 * where anything is taken, compared, or thrown away.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findImplicitAny } from "./check-implicit-any.mjs";

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "check-implicit-any-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The places reported in `source`, as `line:name`. */
function reported(source) {
  mkdirSync(join(root, "src"));
  const compilerOptions = { strict: true, target: "ES2022", lib: ["ES2022", "DOM"], types: [], noEmit: true };
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions, include: ["src"] }));
  writeFileSync(join(root, "src", "read.ts"), source);
  return findImplicitAny(join(root, "tsconfig.json"), /\/src\//).map(({ line, name }) => `${line}:${name}`);
}

describe("check-implicit-any", () => {
  it("reports a name declared from a value typed any", () => {
    expect(reported('export const parsed = JSON.parse("{}");\n')).toEqual([
      "1:parsed",
      '1:JSON.parse("{}")',
    ]);
  });

  it("reports a field read from a value typed any", () => {
    const source = "export function count(text: string): number {\n  return JSON.parse(text).count;\n}\n";

    expect(reported(source)).toEqual(["2:JSON.parse(text)", "2:count"]);
  });

  it("reports a rejection reason taken without a type", () => {
    const source = "export const message = Promise.reject(new Error()).catch((e) => String(e));\n";

    expect(reported(source)).toEqual(["1:e"]);
  });

  it("reports a value typed any handed to a typed place", () => {
    const source = 'const take = (n: number) => n;\nexport const n = take(JSON.parse("1"));\n';

    expect(reported(source)).toEqual(['2:JSON.parse("1")']);
  });

  it("leaves alone a value read into unknown", () => {
    const source = [
      'export const parsed: unknown = JSON.parse("{}");',
      "export function reasonOf(signal: AbortSignal): unknown {",
      "  return signal.reason;",
      "}",
      "",
    ].join("\n");

    expect(reported(source)).toEqual([]);
  });

  it("leaves alone a value passed where anything is taken, compared, or thrown away", () => {
    const source = [
      'export const text = JSON.stringify(JSON.parse("{}"));',
      "export const same = (signal: AbortSignal, error: unknown) => error === signal.reason;",
      'JSON.parse("{}");',
      "",
    ].join("\n");

    expect(reported(source)).toEqual([]);
  });
});
