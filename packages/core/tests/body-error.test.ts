/**
 * A body's refusal is one of Courier's own errors: a `CourierError` with
 * its code, which `isCourierError` tells apart, and the status it is
 * answered with.
 */
import { describe, expect, it } from "vitest";

import { BodyError } from "../src/adapter/body-error";
import { CourierError, isCourierError } from "../src/errors";

describe("BodyError", () => {
  it("is a CourierError with its code, its cause and the status it is answered with", () => {
    const reason = new Error("the socket closed");

    const error = new BodyError("BODY_INCOMPLETE", "The request body ended short", {
      cause: reason,
    });

    expect(error).toBeInstanceOf(CourierError);
    expect(isCourierError(error)).toBe(true);
    expect(error).toMatchObject({
      name: "BodyError",
      code: "BODY_INCOMPLETE",
      status: 413,
      message: "The request body ended short",
      cause: reason,
    });
  });

  it.each([
    ["BODY_TOO_LARGE", 413],
    ["BODY_ENCODING_UNSUPPORTED", 415],
    ["BODY_TIMEOUT", 408],
    ["BODY_MALFORMED", 400],
    ["UPLOAD_STORAGE_FULL", 507],
  ] as const)("answers %s with %i", (code, status) => {
    expect(new BodyError(code, "refused").status).toBe(status);
  });
});
