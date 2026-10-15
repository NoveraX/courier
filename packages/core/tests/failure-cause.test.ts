/**
 * Why a request that got no answer failed, as Studio is told it: the
 * system's code and text, with nothing in them that could be a credential.
 */
import { describe, expect, it } from "vitest";

import { HTTPError } from "../src/errors";
import { failureCause, shownCause } from "../src/studio/failure-cause";

function unanswered(data: unknown): HTTPError {
  return new HTTPError({ status: 0, headers: new Headers(), data });
}

describe("failureCause", () => {
  it("reads the system's code and text from a request that got no answer", () => {
    const error = unanswered({
      success: false,
      message: "getaddrinfo ENOTFOUND no-such-host.invalid",
      code: "ENOTFOUND",
    });

    expect(failureCause(error)).toEqual({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND no-such-host.invalid",
    });
  });

  it("has none for a request the upstream answered", () => {
    const error = new HTTPError({
      status: 500,
      headers: new Headers(),
      data: { message: "boom", code: "INTERNAL" },
    });

    expect(failureCause(error)).toBeUndefined();
  });

  it("has none for an error that is not a failed request", () => {
    expect(failureCause(new Error("getaddrinfo ENOTFOUND x"))).toBeUndefined();
    expect(failureCause("ENOTFOUND")).toBeUndefined();
  });

  it("has none when the failure carries no text", () => {
    expect(failureCause(unanswered(undefined))).toBeUndefined();
    expect(failureCause(unanswered({ code: "ENOTFOUND" }))).toBeUndefined();
    expect(failureCause(unanswered({ message: "   " }))).toBeUndefined();
  });
});

describe("shownCause", () => {
  it("cuts a query string and its token out of a URL in the text", () => {
    const cause = shownCause({
      message: "connect ECONNREFUSED for https://api.test/v1/users?token=s3cret&x=1#frag",
      code: "ECONNREFUSED",
    });

    expect(cause).toEqual({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED for https://api.test/v1/users",
    });
    expect(JSON.stringify(cause)).not.toContain("s3cret");
  });

  it("cuts the user and password out of a URL in the text", () => {
    const cause = shownCause({
      message:
        "Request cannot be constructed from a URL that includes credentials: http://user:pass@127.0.0.1:1/x?token=abc",
    });

    expect(cause?.message).toBe(
      "Request cannot be constructed from a URL that includes credentials: http://127.0.0.1:1/x",
    );
    expect(cause?.message).not.toMatch(/user|pass|token|abc/);
  });

  it("cuts the secrets out of a URL the parser cannot read", () => {
    const cause = shownCause({ message: "failed at http://admin:hunter2@[bad/path?key=k1" });

    expect(cause?.message).toBe("failed at http://[bad/path");
  });

  it("keeps a code that reads as a system error code", () => {
    for (const code of ["ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "DEPTH_ZERO_SELF_SIGNED_CERT"]) {
      expect(shownCause({ message: "failed", code })?.code).toBe(code);
    }
  });

  it("drops a code that does not read as one", () => {
    for (const code of ["enotfound", "E", "Bearer abc", "A".repeat(65), 23, "E-1", "1ABC"]) {
      expect(shownCause({ message: "failed", code })).toEqual({ message: "failed" });
    }
  });

  it("clears control characters and cuts a long text to 300 characters", () => {
    const cause = shownCause({ message: `line one\nline two\u0000${"x".repeat(400)}` });

    expect(cause?.message.startsWith("line one line two ")).toBe(true);
    expect(cause?.message).toHaveLength(300);
    expect(cause?.message.endsWith("…")).toBe(true);
  });

  it("has none for a value that is no cause", () => {
    expect(shownCause(undefined)).toBeUndefined();
    expect(shownCause("ENOTFOUND")).toBeUndefined();
    expect(shownCause({ message: 42 })).toBeUndefined();
  });
});
