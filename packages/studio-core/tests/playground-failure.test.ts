/**
 * What the Playground is shown of a call that failed: its error's text and
 * the body of a request that got no answer cut as every error text Studio
 * is told is, and an upstream's answer whole. Through the proxy, a call
 * `browsersOnly` refused is told why, and one stopped at a redirect is told
 * whose it was: the route's names where it pointed, that address cut as any
 * other text; the API's, which the proxy answers with its status alone,
 * says what to change in the source. A 304 is no redirect.
 */
import { HTTPError } from "@noverax/courier";
import { UNSHOWN_CAUSE } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";

import { BROWSERS_ONLY_ADVICE } from "../src/runtime/browsers-only-refusal";
import { playgroundFailure } from "../src/runtime/playground-failure";
import { upstreamRedirectAdvice } from "../src/runtime/proxy-redirect";

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

  it("tells a call through the proxy that browsersOnly refused why its pass did not carry it", () => {
    const refusal = () =>
      new HTTPError({ status: 403, headers: new Headers(), data: { code: "BROWSERS_ONLY" } });

    expect(playgroundFailure(refusal(), true).error).toBe(BROWSERS_ONLY_ADVICE);
    expect(playgroundFailure(refusal(), false).error).toBe("HTTP 403");
  });

  it("cuts the address of a redirect a call through the proxy did not follow", () => {
    const headers = new Headers({ location: "http://u:pa55@other.example/cb?token=s3cret" });
    const failure = playgroundFailure(
      new HTTPError({ status: 307, headers, data: undefined }),
      true,
    );

    expect(failure.status).toBe(307);
    expect(failure.error).toContain("http://other.example/cb");
    expect(failure.error).not.toContain("s3cret");
    expect(failure.error).not.toContain("pa55");
  });

  it("tells a call the API redirected elsewhere, which the proxy answers without a Location, what to change in the source", () => {
    const failure = playgroundFailure(
      new HTTPError({ status: 302, headers: new Headers(), data: null }),
      true,
    );

    expect(failure).toMatchObject({ status: 302, error: upstreamRedirectAdvice() });
    expect(failure.error).toContain("baseURL");
    expect(failure.error).not.toContain("COURIER_APP_URL");
  });

  it("tells a redirect a call made in Direct mode did not follow nothing of the proxy", () => {
    const headers = new Headers({ location: "http://other.example/cb" });
    const failure = playgroundFailure(new HTTPError({ status: 307, headers, data: undefined }));

    expect(failure).toMatchObject({ status: 307, error: "HTTP 307" });
  });

  it("takes a 304 for the answer it is, not a redirect", () => {
    const failure = playgroundFailure(
      new HTTPError({ status: 304, headers: new Headers(), data: null }),
      true,
    );

    expect(failure).toMatchObject({ status: 304, error: "HTTP 304" });
  });
});
