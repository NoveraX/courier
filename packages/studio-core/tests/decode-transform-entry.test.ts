/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { decodeTransformEntry } from "../src/runtime/decode-transform-entry";
import { encodeTransformEntry } from "../src/runtime/encode-transform-entry";

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);
const CODE = 'exports.greeting = "héllo, 世界";\n';

describe("decodeTransformEntry", () => {
  it("hands back the code, byte for byte, for the input it names", () => {
    expect(decodeTransformEntry(encodeTransformEntry(DIGEST, CODE), DIGEST)).toEqual({ state: "hit", code: CODE });
  });

  it("hands back empty code", () => {
    expect(decodeTransformEntry(encodeTransformEntry(DIGEST, ""), DIGEST)).toEqual({ state: "hit", code: "" });
  });

  it("calls an entry for another input stale", () => {
    expect(decodeTransformEntry(encodeTransformEntry(OTHER_DIGEST, CODE), DIGEST)).toEqual({ state: "stale" });
  });

  it("calls an entry in another version of the format stale", () => {
    const entry = Buffer.from(`// courier-transform 1 ${DIGEST}\n${CODE}`, "utf8");

    expect(decodeTransformEntry(entry, DIGEST)).toEqual({ state: "stale" });
  });

  it("calls a file with no header line near its start stale", () => {
    expect(decodeTransformEntry(Buffer.from("x".repeat(4096), "latin1"), DIGEST)).toEqual({ state: "stale" });
  });

  it.each<[string, (entry: Buffer) => Buffer]>([
    ["truncated", (entry) => entry.subarray(0, entry.length - 1)],
    ["extended", (entry) => Buffer.concat([entry, Buffer.from("\n")])],
    [
      "altered at the same length",
      (entry) => {
        const altered = Buffer.from(entry);
        altered[altered.length - 2] = 0x3f;
        return altered;
      },
    ],
  ])("calls an entry whose body was %s damaged", (_how, damage) => {
    const entry = damage(encodeTransformEntry(DIGEST, CODE));

    expect(decodeTransformEntry(entry, DIGEST)).toEqual({ state: "damaged" });
  });
});
