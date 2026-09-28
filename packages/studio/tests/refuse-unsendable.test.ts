/**
 * A parsed specification Studio hands the UI is one the UI can send back:
 * one larger than a request body may be is refused with 413 where it is
 * parsed, not after it was shown.
 */
import { describe, expect, it } from "vitest";

import type { ParsedSpec } from "../src/apis";
import { MAX_MESSAGE_BYTES } from "../src/server/max-message-bytes";
import { refuseUnsendable } from "../src/server/refuse-unsendable";

function specOf(descriptionBytes: number): ParsedSpec {
  return {
    title: "Large",
    version: "1",
    description: "x".repeat(descriptionBytes),
    baseURL: "",
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    skipped: [],
  };
}

describe("refuseUnsendable", () => {
  it("takes a specification a request body can carry", () => {
    expect(() => refuseUnsendable(specOf(1024))).not.toThrow();
  });

  it("refuses one larger than a request body may be, with 413 and its size", () => {
    let refusal: unknown;
    try {
      refuseUnsendable(specOf(MAX_MESSAGE_BYTES));
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toMatchObject({ code: "SPEC_TOO_LARGE", httpStatus: 413 });
    expect(String(refusal)).toContain("Studio imports one of at most 64 MB");
  });
});
