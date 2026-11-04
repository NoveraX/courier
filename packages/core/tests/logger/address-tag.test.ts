/**
 * How a log line names a client's address: by a tag that is the same for
 * one address all through a process, tells addresses apart, and does not
 * give the address back.
 */
import { describe, expect, it } from "vitest";

import { addressTag } from "../../src/logger/address-tag";

describe("addressTag", () => {
  it("names an address by eight hex digits, the same each time in one process", () => {
    const tag = addressTag("203.0.113.7");

    expect(tag).toMatch(/^[0-9a-f]{8}$/);
    expect(addressTag("203.0.113.7")).toBe(tag);
  });

  it("tells addresses apart", () => {
    const tags = new Set(
      Array.from({ length: 256 }, (_, host) => addressTag(`198.51.100.${host}`)),
    );

    expect(tags.size).toBe(256);
  });

  it("does not give the address back, in whole or in part", () => {
    const tag = addressTag("2001:db8::1");

    expect(tag).not.toContain("2001");
    expect(tag).not.toContain("db8");
  });
});
