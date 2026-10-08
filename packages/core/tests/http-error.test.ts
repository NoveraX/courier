/**
 * An HTTPError as it is printed — by Courier's log, `console.error`, Node's
 * report of an uncaught error — keeps the user's session out of the line:
 * a cookie the API set, a token sent back, an API key are hidden by value,
 * named by what they are, while `error.headers` still holds them all.
 */
import { format, inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTPError } from "../src/errors/http-error";
import { createLogger } from "../src/logger";

const SECRETS = /s3ss10n|c5rf-t0ken|api-k3y|b3arer-t0ken/;

function answered(): HTTPError<{ error: string }> {
  const headers = new Headers({
    "content-type": "application/json",
    authorization: "Bearer b3arer-t0ken",
    "x-api-key": "api-k3y",
  });
  headers.append("set-cookie", "sid=s3ss10n; Path=/; HttpOnly; Secure");
  headers.append("set-cookie", "csrftoken=c5rf-t0ken; Path=/");
  return new HTTPError({ status: 503, headers, data: { error: "down" } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an HTTPError, printed", () => {
  it("names each cookie the API set, with its attributes and without its value", () => {
    const printed = inspect(answered());

    expect(printed).toContain("HTTPError: HTTP 503");
    expect(printed).toContain("sid=[redacted]; Path=/; HttpOnly; Secure");
    expect(printed).toContain("csrftoken=[redacted]; Path=/");
    expect(printed).toContain("'Bearer [redacted]'");
    expect(printed).toContain("'content-type': 'application/json'");
    expect(printed).not.toMatch(SECRETS);
  });

  it("hides them however deep it sits: in a cause, in an object, past the depth printed", () => {
    const error = answered();
    const printed = [
      inspect(new Error("wrapped", { cause: error })),
      inspect({ outer: { inner: { error } } }, { depth: 5 }),
      inspect(error, { depth: 0 }),
      inspect(error, { depth: null }),
    ].join("\n");

    expect(printed).not.toMatch(SECRETS);
  });

  it("keeps every header for the code that reads it", () => {
    const error = answered();

    expect(error.headers.get("x-api-key")).toBe("api-k3y");
    expect(error.headers.getSetCookie()).toEqual([
      "sid=s3ss10n; Path=/; HttpOnly; Secure",
      "csrftoken=c5rf-t0ken; Path=/",
    ]);
  });

  it("reaches Courier's own log with the session left out", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    createLogger("Session").warn("Asking /csrf for the token failed", answered());

    const line = warn.mock.calls.map((call) => format(...call)).join("\n");
    expect(warn).toHaveBeenCalled();
    expect(line).not.toMatch(SECRETS);
  });
});
