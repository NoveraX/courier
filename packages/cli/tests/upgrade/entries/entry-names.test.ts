import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  bindsOtherwise,
  CORE_ENTRIES,
  ENTRY_EXPORTS,
  entryTakes,
} from "../../../src/upgrade/entries/entry-names";

/* The core's list of what each entry exports, as the core's own test holds it to the built entries. */
const LISTED = JSON.parse(
  readFileSync(new URL("../../../../core/entry-exports.json", import.meta.url), "utf8"),
) as Record<string, { values: string[]; types: string[]; otherThanRoot?: Record<string, string> }>;

describe("the names of the core's entries", () => {
  it("are the core's list, entry by entry", () => {
    for (const [side, entry] of Object.entries(CORE_ENTRIES)) {
      const listed = LISTED[`./${entry.split("/").at(-1)}`];
      const read = ENTRY_EXPORTS[side as keyof typeof CORE_ENTRIES];

      expect([...read.values].sort()).toEqual([...(listed?.values ?? [])].sort());
      expect([...read.types].sort()).toEqual([...(listed?.types ?? [])].sort());
      expect([...read.otherThanRoot].sort()).toEqual(
        Object.keys(listed?.otherThanRoot ?? {}).sort(),
      );
    }
  });

  it("are a value in every entry they are a value in, never a type in another", () => {
    const values = new Set([...ENTRY_EXPORTS.client.values, ...ENTRY_EXPORTS.server.values]);
    const types = new Set([...ENTRY_EXPORTS.client.types, ...ENTRY_EXPORTS.server.types]);

    expect([...values].filter((name) => types.has(name))).toEqual([]);
  });

  it("are taken by an entry that exports them as the root does, values as values and types as types", () => {
    expect(entryTakes("client", "createCaller")).toBe(true);
    expect(entryTakes("client", "isHTTPError")).toBe(true);
    expect(entryTakes("client", "CallOptions")).toBe(true);
    expect(entryTakes("client", "registerSources")).toBe(false);
    expect(entryTakes("client", "IncomingRequest")).toBe(false);
    expect(entryTakes("server", "registerSources")).toBe(true);
    expect(entryTakes("server", "createFetch")).toBe(false);
    expect(entryTakes("server", "AuthError")).toBe(false);
    expect(entryTakes("client", "default")).toBe(false);
  });

  it("mark createCaller as the one name each entry binds to another value than the root", () => {
    expect(bindsOtherwise("client", "createCaller")).toBe(true);
    expect(bindsOtherwise("server", "createCaller")).toBe(true);
    expect(bindsOtherwise("client", "isHTTPError")).toBe(false);
    expect(bindsOtherwise("server", "isHTTPError")).toBe(false);
  });
});
