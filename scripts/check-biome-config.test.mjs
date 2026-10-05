/**
 * Self-test for `scripts/check-biome-config.mjs`: a config naming another
 * version's schema, and `biome migrate` finding something to change, are
 * both out of date.
 */

import { describe, expect, it } from "vitest";
import { migrationPending, staleSchemas } from "./check-biome-config.mjs";

const SCHEMA = (version) => `https://biomejs.dev/schemas/${version}/schema.json`;

describe("Biome's configuration", () => {
  it("is out of date where a config names another version's schema, or none", () => {
    const configs = [
      { path: "biome.json", schema: SCHEMA("2.5.14") },
      { path: "docs/biome.json", schema: SCHEMA("2.4.6") },
      { path: "other/biome.json", schema: undefined },
    ];

    expect(staleSchemas("2.5.14", configs)).toEqual([
      `docs/biome.json names ${SCHEMA("2.4.6")}, not ${SCHEMA("2.5.14")}`,
      `other/biome.json names no schema, not ${SCHEMA("2.5.14")}`,
    ]);
  });

  it("is out of date where `biome migrate` would change it", () => {
    expect(migrationPending("biome.json migrate\n  i Configuration file can be updated.")).toBe(
      true,
    );
    expect(migrationPending("Your configuration file is up to date.")).toBe(false);
  });
});
