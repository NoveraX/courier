/**
 * Whether a file holds what a load evaluated from it, compared as text read
 * the way the loader reads it: a file that is not valid UTF-8 holds what was
 * evaluated from it, and a module evaluated from bytes a save replaced, then
 * restored, is told apart from one evaluated from the bytes the walk read.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { evaluatedOtherBytes, holdsEvaluatedText } from "../src/server/evaluated-on-disk";
import { contentHashOf } from "../src/server/file-content-hash";
import { evaluatedTextHash, observedTransforms } from "../src/server/observed-transforms";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function file(bytes: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-evaluated-"));
  dirs.push(dir);
  const path = join(dir, "api.ts");
  writeFileSync(path, bytes);
  return path;
}

/* Not UTF-8: a lone continuation byte, which decoding turns into U+FFFD. */
const NOT_UTF8 = Buffer.from([0x65, 0x78, 0x80, 0x0a]);

describe("holdsEvaluatedText", () => {
  it("is true while the file holds the text evaluated, false once it does not", () => {
    const path = file("export const a = 1\n");
    const evaluated = evaluatedTextHash("export const a = 1\n");

    expect(holdsEvaluatedText(path, evaluated)).toBe(true);
    writeFileSync(path, "export const a = 2\n");
    expect(holdsEvaluatedText(path, evaluated)).toBe(false);
  });

  it("is true for a file that is not UTF-8, read as the loader reads it", () => {
    const path = file(NOT_UTF8);

    expect(holdsEvaluatedText(path, evaluatedTextHash(NOT_UTF8.toString("utf8")))).toBe(true);
  });

  it("is false for a file that is gone", () => {
    expect(holdsEvaluatedText(join(tmpdir(), "courier-none", "api.ts"), "x")).toBe(false);
  });
});

describe("evaluatedOtherBytes", () => {
  it("is false when the load evaluated the bytes it read", () => {
    const path = file("export const a = 1\n");
    const read = contentHashOf(path) ?? "";

    expect(evaluatedOtherBytes(path, read, evaluatedTextHash("export const a = 1\n"))).toBe(false);
  });

  it("is false for a file that is not UTF-8, whose text hashes otherwise than its bytes", () => {
    const path = file(NOT_UTF8);
    const read = contentHashOf(path) ?? "";
    const evaluated = evaluatedTextHash(NOT_UTF8.toString("utf8"));

    expect(read).not.toBe(evaluated);
    expect(evaluatedOtherBytes(path, read, evaluated)).toBe(false);
  });

  it("is true when another text was evaluated, though the file holds the bytes read again", () => {
    const path = file("export const a = 1\n");
    const read = contentHashOf(path) ?? "";

    expect(evaluatedOtherBytes(path, read, evaluatedTextHash("export const a = 2\n"))).toBe(true);
  });
});

describe("observedTransforms", () => {
  it("notes the text of each module it transforms, by file, and hands back what the cache gives", () => {
    const observed = observedTransforms({ transform: (options, compute) => compute(options) });

    const result = observed.cache.transform(
      { source: "export const a = 1", filename: "/app/src/api.ts" },
      () => ({ code: "exports.a = 1" }),
    );

    expect(result).toEqual({ code: "exports.a = 1" });
    expect([...observed.evaluated]).toEqual([
      ["/app/src/api.ts", evaluatedTextHash("export const a = 1")],
    ]);
  });
});
