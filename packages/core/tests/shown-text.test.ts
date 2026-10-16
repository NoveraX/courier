/**
 * An error's text as Studio is told it: anything in it that could be a
 * credential cut out, prose that only names one kept, and a text of any
 * size read in the same short time.
 */
import { describe, expect, it } from "vitest";

import { shownText } from "../src/studio/shown-text";

describe("shownText cuts", () => {
  it("the header value the platform refused and quoted", () => {
    expect(shownText('Headers.append: "Bearer B34rer\nx" is an invalid header value.')).toBe(
      'Headers.append: "[redacted]" is an invalid header value.',
    );
    expect(shownText('Headers.set: "x-k3y\n" is an invalid header name.')).toBe(
      'Headers.set: "[redacted]" is an invalid header name.',
    );
    expect(shownText('Invalid value "s3cret\nx" for header "x-api-key"')).toBe(
      'Invalid value "[redacted]" for header "x-api-key"',
    );
  });

  it("a credential after an authorization scheme, with or without a colon", () => {
    expect(shownText("sent Bearer B34rer.t0k3n to the API")).toBe(
      "sent Bearer [redacted] to the API",
    );
    expect(shownText("bad Basic dXNlcjpwYXNz")).toBe("bad Basic [redacted]");
    expect(shownText("header Token 7f3a9c2e, rejected")).toBe("header Token [redacted], rejected");
    expect(shownText("Bearer: B34rer-t0k3n")).toBe("Bearer: [redacted]");
  });

  it("the value of a pair whose name says it is secret", () => {
    expect(shownText("failed: token=s3cret&page=2")).toBe("failed: token=[redacted]&page=2");
    expect(shownText("upstream refused x-api-key=s3cret")).toBe(
      "upstream refused x-api-key=[redacted]",
    );
    expect(shownText("pass=hunter key=k1 sid=42")).toBe(
      "pass=[redacted] key=[redacted] sid=[redacted]",
    );
    expect(shownText('body {"password":"hunter","name":"ana"}')).toBe(
      'body {"password":"[redacted]","name":"ana"}',
    );
    expect(shownText("x-auth: a1b2c3d4, clientSecret: 'p4ss w0rd'")).toBe(
      "x-auth: [redacted], clientSecret: '[redacted]'",
    );
    expect(shownText("Authorization: Bearer B34rer")).toBe("Authorization: Bearer [redacted]");
  });

  it("a JWT and a key in a known provider's format, wherever they are", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    // Joined at run time, so no key-shaped literal sits in the source for a secret scanner to flag.
    const stripeKey = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");
    const githubToken = ["ghp", "16C7e42F292c6912E7710c838347Ae178B4a"].join("_");
    expect(shownText(`rejected ${jwt} as expired`)).toBe("rejected [redacted] as expired");
    expect(shownText(`charge with ${stripeKey} failed`)).toBe("charge with [redacted] failed");
    expect(shownText(`push with ${githubToken} refused`)).toBe("push with [redacted] refused");
  });

  it("the user, password, query, fragment and a token in the path of a URL", () => {
    expect(shownText("GET https://ana:pw@api.test/v1?sig=abc#top failed")).toBe(
      "GET https://api.test/v1 failed",
    );
    expect(
      shownText("POST https://hooks.test/services/T0001/B0001/XyZ4bc9dEf8ghI7jkL6mnO5p failed"),
    ).toBe("POST https://hooks.test/services/T0001/B0001/[redacted] failed");
  });

  it("a user and password written before a host without a scheme", () => {
    expect(shownText("could not reach ana:s3cret@db.internal:5432")).toBe(
      "could not reach [redacted]@db.internal:5432",
    );
  });
});

describe("shownText keeps", () => {
  it("prose that only names a credential", () => {
    for (const text of [
      "Token expired",
      "Basic authentication required",
      "Bearer token missing",
      "tokens: 3 of 5 used",
      "password: required",
      "api key: missing",
      "the session ended",
    ]) {
      expect(shownText(text)).toBe(text);
    }
  });

  it("the platform's own texts", () => {
    for (const text of [
      "getaddrinfo ENOTFOUND no-such-host.invalid",
      "connect ECONNREFUSED 127.0.0.1:6299",
      "self-signed certificate; if the root CA is installed locally, try running Node.js with --use-system-ca",
      "Request cannot be constructed from a URL that includes credentials: http://127.0.0.1:1/x",
      "Validation failed",
      "[api][users][nope]: method not found",
      "GET https://api.test/users/42 failed",
    ]) {
      expect(shownText(text)).toBe(text);
    }
  });

  it("a long text's start, cut to the length asked for", () => {
    expect(shownText("word ".repeat(20), 10)).toBe("word word…");
  });
});

describe("shownText on a text of any size", () => {
  const MEGABYTE = 1024 * 1024;
  const hostile = {
    "dotted names": "token.".repeat(MEGABYTE / 6),
    "dotted letters": "a.".repeat(MEGABYTE / 2),
    "names without a value": "token ".repeat(MEGABYTE / 6),
    "pairs without an end": "token=".repeat(MEGABYTE / 6),
    "JWT starts": "eyJ-".repeat(MEGABYTE / 4),
    "schemes without a host": "a:/".repeat(MEGABYTE / 3),
    "quotes that never close": `"${"x".repeat(MEGABYTE)}`,
    "users without a host": " a:b".repeat(MEGABYTE / 4),
    "one word": "x".repeat(MEGABYTE),
  };

  for (const [name, text] of Object.entries(hostile)) {
    it(`reads a megabyte of ${name} in tens of milliseconds`, () => {
      const started = performance.now();
      shownText(text);
      shownText(text, 300);
      expect(performance.now() - started).toBeLessThan(100);
    });
  }

  it("shows no part of a single word longer than it reads", () => {
    expect(shownText("x".repeat(50), 10)).toBe("[redacted]");
  });

  it("drops the word the read ends inside, rather than show half of it", () => {
    const text = `${"word ".repeat(1599)}Bearer${"x".repeat(10)}`;

    expect(shownText(text, 2000)).not.toContain("Bearer");
  });
});
