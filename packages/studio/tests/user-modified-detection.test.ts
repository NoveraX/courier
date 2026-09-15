import { describe, expect, it } from "vitest";
import { generateFingerprints } from "../src/apis";
import { detectUserModified } from "../src/server/registry-fingerprints";

/**
 * Validates the semantic used by write-helpers + update-helpers: compare
 * the fingerprints Studio recorded after the previous sync against a fresh
 * snapshot of what's on disk now. An endpoint whose disk hash diverges
 * from the prior recorded hash was edited by the user between syncs.
 */
describe("detectUserModified — prev-state vs current-disk comparison", () => {
  const pristine = `export const users = {
    getAll: endpoint<void, User[]>()({
      method: "GET",
      path: "/users",
    }),
};`;

  const edited = `export const users = {
    getAll: endpoint<void, User[]>()({
      method: "GET",
      path: "/users?cache=1",
    }),
};`;

  it("flags an endpoint whose disk content changed since the last sync", () => {
    const prevFingerprints = generateFingerprints(pristine);
    expect(prevFingerprints.getAll).toBeDefined();

    const diskNow = { "src/api/users.ts": edited };
    const modified = detectUserModified(prevFingerprints, diskNow);
    expect(modified).toEqual(["getAll"]);
  });

  it("returns empty when the disk content still matches the prior fingerprint", () => {
    const prevFingerprints = generateFingerprints(pristine);
    const diskNow = { "src/api/users.ts": pristine };
    expect(detectUserModified(prevFingerprints, diskNow)).toEqual([]);
  });

  it("ignores endpoints on disk that were never recorded in prev state", () => {
    const diskNow = { "src/api/users.ts": pristine };
    expect(detectUserModified({}, diskNow)).toEqual([]);
  });
});
