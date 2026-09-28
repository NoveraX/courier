/**
 * A presence record is read back from a hash any process can write to. One
 * that is not the shape Courier writes fails as damaged, where it used to be
 * read as an entry with no user and no join time.
 */
import { describe, expect, it } from "vitest";

import { packMeta, unpackMeta } from "../src/redis-presence-keys";

describe("unpackMeta", () => {
  it("reads back the record packMeta wrote", () => {
    const meta = { userId: "u1", joinedAt: 1_700_000_000_000, metadata: { cursor: 3 } };

    expect(unpackMeta(packMeta(meta))).toEqual(meta);
  });

  it("fails on a record of another shape", () => {
    expect(() => unpackMeta(JSON.stringify({ user: "u1" }))).toThrow(
      "A presence record in Redis is not one Courier wrote",
    );
    expect(() => unpackMeta(JSON.stringify({ userId: "u1", joinedAt: "yesterday", metadata: {} }))).toThrow(
      "A presence record in Redis is not one Courier wrote",
    );
  });

  it("fails on a record that is not JSON", () => {
    expect(() => unpackMeta("{userId:")).toThrow(SyntaxError);
  });
});
