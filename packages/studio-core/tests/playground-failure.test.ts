/**
 * What the Playground is shown of a call that failed: its error's text and
 * the body of a request that got no answer cut as every error text Studio
 * is told is, and an upstream's answer whole.
 */
import { HTTPError } from "@noverax/courier";
import { UNSHOWN_CAUSE } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import { playgroundFailure } from "../src/runtime/playground-failure";

describe("playgroundFailure", () => {
  it("cuts the token a refused header value carried out of the error", () => {
    const failure = playgroundFailure(
      new TypeError('Headers.append: "Bearer B34rer\nx" is an invalid header value.'),
    );

    expect(failure).toEqual({
      kind: "http-result",
      status: 500,
      error: 'Headers.append: "[redacted]" is an invalid header value.',
    });
  });

  it("passes on none of what the app's own fetch put in a request with no answer", () => {
    const failure = playgroundFailure(
      new HTTPError({
        status: 0,
        headers: new Headers(),
        data: { success: false, message: "upstream refused x-api-key=s3cret" },
      }),
    );

    expect(failure.data).toEqual({ success: false, message: UNSHOWN_CAUSE });
    expect(JSON.stringify(failure)).not.toContain("s3cret");
  });

  it("keeps the platform's reason and code for a request with no answer", () => {
    const failure = playgroundFailure(
      new HTTPError({
        status: 0,
        headers: new Headers(),
        data: { success: false, message: "getaddrinfo ENOTFOUND api.test", code: "ENOTFOUND" },
      }),
    );

    expect(failure.data).toEqual({
      success: false,
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.test",
    });
  });

  it("keeps an upstream's answer whole: the Playground shows it as the response", () => {
    const body = { message: "nope", token: "the upstream's own field" };
    const failure = playgroundFailure(
      new HTTPError({ status: 404, headers: new Headers(), data: body }),
    );

    expect(failure).toMatchObject({ status: 404, error: "HTTP 404", data: body });
  });
});
