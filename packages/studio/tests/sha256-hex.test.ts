import { describe, expect, it } from "vitest";

import { sha256Hex } from "../src/server/sha256-hex";

const ABC_DIGEST = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Hex", () => {
  it("hashes a string as its UTF-8 bytes", () => {
    expect(sha256Hex("abc")).toBe(ABC_DIGEST);
    expect(sha256Hex("é")).toBe(sha256Hex(Buffer.from([0xc3, 0xa9])));
  });

  it("hashes no bytes as the digest of the empty input", () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
