/**
 * What a runtime's fetch keeps a copy of while it sends a request's body,
 * told by the version of undici it is built on.
 */
import { describe, expect, it } from "vitest";

import { FETCH_COPIES, fetchCopies } from "../src/utils/fetch-copies";

describe("fetchCopies", () => {
  it.each([
    ["6.29.1", { forms: true, streams: true }],
    ["7.30.1", { forms: true, streams: true }],
    ["8.0.0", { forms: true, streams: false }],
    ["8.12.2", { forms: true, streams: false }],
    ["10.1.0", { forms: true, streams: false }],
  ])("reads undici %s", (version, copies) => {
    expect(fetchCopies(version)).toEqual(copies);
  });

  it("finds nothing copied by a runtime that is not built on undici", () => {
    expect(fetchCopies(undefined)).toEqual({ forms: false, streams: false });
  });

  it("is this runtime's own: Node's fetch", () => {
    expect(FETCH_COPIES).toEqual(fetchCopies(process.versions.undici));
  });
});
