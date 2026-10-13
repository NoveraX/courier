/**
 * SHA-256 in JavaScript, for runtimes without `crypto.subtle`, gives the
 * digest the platform gives: the published test vectors, every length
 * around a block's edges, and text beyond ASCII.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sha256 } from "../../src/utils/sha256";
import { sha256Hex } from "../../src/utils/sha256-hex";

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const encoded = (text: string): Uint8Array => new TextEncoder().encode(text);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sha256", () => {
  it("gives the digests FIPS 180-4 publishes", () => {
    expect(hex(sha256(encoded("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(hex(sha256(encoded("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hex(sha256(encoded("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("gives the platform's digest for every length across three blocks", () => {
    const bytes = Uint8Array.from({ length: 200 }, (_, at) => (at * 31 + 7) % 256);

    for (let length = 0; length <= bytes.length; length++) {
      const part = bytes.subarray(0, length);
      expect(hex(sha256(part)), `${length} bytes`).toBe(
        createHash("sha256").update(part).digest("hex"),
      );
    }
  });

  it("gives the platform's digest for a megabyte", () => {
    const bytes = new Uint8Array(1_000_000).fill(0x61);

    expect(hex(sha256(bytes))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("sha256Hex", () => {
  const text = "writes:2\u0000sid=a1\u0000Bearer ключ-🔑\u0000csrf";
  const expected = createHash("sha256").update(text, "utf8").digest("hex");

  it("digests with crypto.subtle where the runtime has it", async () => {
    expect(await sha256Hex(text)).toBe(expected);
  });

  it("gives the same digest on a page over plain HTTP, which has no crypto.subtle", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes });

    expect(await sha256Hex(text)).toBe(expected);
  });

  it("gives the same digest in React Native, which has no crypto at all", async () => {
    vi.stubGlobal("crypto", undefined);

    expect(await sha256Hex(text)).toBe(expected);
  });
});
