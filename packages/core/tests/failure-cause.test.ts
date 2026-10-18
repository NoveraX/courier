/**
 * Why a request that got no answer failed, as the app tells Studio: the
 * platform's code and text as it said them. Studio shows them whole to the
 * page that holds its token, and cuts what leaves it; the app ships no
 * code for that.
 */
import { describe, expect, it } from "vitest";

import { HTTPError } from "../src/errors";
import { failureCause } from "../src/studio/failure-cause";

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

  it("passes the text on as the platform wrote it, an address and all", () => {
    const text = "connect ECONNREFUSED for https://ana:pw@api.test/v1/users?token=s3cret";

    expect(failureCause(unanswered({ message: text, code: "ECONNREFUSED" }))).toEqual({
      code: "ECONNREFUSED",
      message: text,
    });
  });

  it("takes a code only as the system names it, a string", () => {
    expect(failureCause(unanswered({ message: "refused", code: 23 }))).toEqual({
      message: "refused",
    });
    expect(failureCause(unanswered({ message: "refused", code: "" }))).toEqual({
      message: "refused",
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
