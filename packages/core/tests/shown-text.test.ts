/**
 * An error's text as Studio is told it: anything in it that could be a
 * credential cut out, and the rest as it was.
 */
import { describe, expect, it } from "vitest";

import { shownText } from "../src/studio/shown-text";

describe("shownText", () => {
  it("cuts the header value the platform refused and quoted", () => {
    expect(shownText('Headers.append: "Bearer B34rer\nx" is an invalid header value.')).toBe(
      'Headers.append: "[redacted]" is an invalid header value.',
    );
    expect(shownText('Headers.set: "x-k3y\n" is an invalid header name.')).toBe(
      'Headers.set: "[redacted]" is an invalid header name.',
    );
  });

  it("cuts what follows an authorization scheme", () => {
    expect(shownText("sent Bearer B34rer.t0k3n to the API")).toBe(
      "sent Bearer [redacted] to the API",
    );
    expect(shownText("bad Basic dXNlcjpwYXNz")).toBe("bad Basic [redacted]");
    expect(shownText("header Token 7f3a, rejected")).toBe("header Token [redacted], rejected");
  });

  it("cuts the value of a pair whose name says it is secret", () => {
    expect(shownText("failed: token=s3cret&page=2")).toBe("failed: token=[redacted]&page=2");
    expect(shownText('body {"password":"hunter2","name":"ana"}')).toBe(
      'body {"password":[redacted],"name":"ana"}',
    );
    expect(shownText("api_key: k3y, access_token=t0k, client_secret='x y'")).toBe(
      "api_key: [redacted], access_token=[redacted], client_secret=[redacted]",
    );
    expect(shownText("Authorization: Bearer B34rer")).not.toContain("B34rer");
  });

  it("cuts the user, password, query and fragment out of a URL", () => {
    expect(shownText("GET https://ana:pw@api.test/v1?sig=abc#top failed")).toBe(
      "GET https://api.test/v1 failed",
    );
  });

  it("leaves the platform's own texts as they are", () => {
    for (const text of [
      "getaddrinfo ENOTFOUND no-such-host.invalid",
      "connect ECONNREFUSED 127.0.0.1:6299",
      "self-signed certificate; if the root CA is installed locally, try running Node.js with --use-system-ca",
      "Validation failed",
      "[api][users][nope]: method not found",
    ]) {
      expect(shownText(text)).toBe(text);
    }
  });

  it("cuts a long text to the length asked for", () => {
    expect(shownText("x".repeat(50), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
