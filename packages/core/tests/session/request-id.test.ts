/**
 * Which header values pass for a request's id: the ids proxies and
 * platforms write, and nothing a log line would have to escape.
 */
import { describe, expect, it } from "vitest";

import { isRequestId, REQUEST_ID_HEADER } from "../../src/session/request-id";

describe("isRequestId", () => {
  it.each([
    "5f0c2a4e9b1d4c7a",
    "3f0c2a4e-8b1d-4c7a-9e2f-6a1b5c3d7e90#12",
    "Root=1-67891233-abcdef012345678912345678;Parent=53995c3f42cd8ad8;Sampled=1",
  ])("takes %s", (id) => {
    expect(isRequestId(id)).toBe(true);
  });

  it.each(["", "a b", 'say "hi"', "back\\slash", "x".repeat(201)])("refuses %j", (id) => {
    expect(isRequestId(id)).toBe(false);
  });
});

describe("REQUEST_ID_HEADER", () => {
  it("is the header nginx and most platforms write", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
