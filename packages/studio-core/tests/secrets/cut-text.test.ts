/**
 * An error's text as it leaves Studio's token page: every credential in a
 * corpus of real error texts cut, and every one of the texts that holds
 * none left as it was — line breaks, addresses and anchors included — and
 * a hostile text read in the time its start takes, whatever its size.
 */
import { describe, expect, it } from "vitest";

import { cutText } from "../../src/secrets/cut-text";
import { PROSE, SECRETS } from "./error-text-corpus";

const stripeKey = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");
const githubToken = ["ghp", "16C7e42F292c6912E7710c838347Ae178B4a"].join("_");
const jwt =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("a text that holds no credential", () => {
  it.each(PROSE)("comes out as it went in: %s", (text) => {
    expect(cutText(text)).toBe(text.trim());
  });
});

describe("a text that holds a credential", () => {
  it.each(SECRETS)("comes out without it: %s", (text, secret) => {
    expect(cutText(text)).not.toContain(secret);
  });
});

describe("what is cut", () => {
  it("the header value the platform refused and quoted, line breaks and quotes inside it and all", () => {
    expect(cutText('Headers.append: "Bearer B34rer\nx" is an invalid header value.')).toBe(
      'Headers.append: "[redacted]" is an invalid header value.',
    );
    expect(cutText('Headers.set: "x-k3y\n" is an invalid header name.')).toBe(
      'Headers.set: "[redacted]" is an invalid header name.',
    );
    expect(cutText('Invalid value "s3cret\nx" for header "x-api-key"')).toBe(
      'Invalid value "[redacted]" for header "x-api-key"',
    );
  });

  it("a credential after an authorization scheme, but not the name of a parameter", () => {
    expect(cutText("sent Bearer B34rer.t0k3n to the API")).toBe(
      "sent Bearer [redacted] to the API",
    );
    expect(cutText("bad Basic dXNlcjpwYXNz")).toBe("bad Basic [redacted]");
    expect(cutText("header Token 7f3a9c2e, rejected")).toBe("header Token [redacted], rejected");
    expect(cutText('WWW-Authenticate: Basic realm="Restricted"')).toBe(
      'WWW-Authenticate: Basic realm="Restricted"',
    );
  });

  it("a strong name's value whatever it reads like, a weak one's only when it reads as a credential", () => {
    expect(cutText("failed: token=s3cret&page=2")).toBe("failed: token=[redacted]&page=2");
    expect(cutText("pass=hunter key=k1 sid=42 key=Zq9x7Kp2")).toBe(
      "pass=[redacted] key=k1 sid=42 key=[redacted]",
    );
    expect(cutText('body {"password":"hunter","name":"ana"}')).toBe(
      'body {"password":"[redacted]","name":"ana"}',
    );
    expect(cutText("x-auth: a1b2c3d4, clientSecret: 'p4ss w0rd'")).toBe(
      "x-auth: [redacted], clientSecret: '[redacted]'",
    );
  });

  it("a JWT and a key in a known provider's format, wherever they are", () => {
    expect(cutText(`rejected ${jwt} as expired`)).toBe("rejected [redacted] as expired");
    expect(cutText(`charge with ${stripeKey} failed`)).toBe("charge with [redacted] failed");
    expect(cutText(`push with ${githubToken} refused`)).toBe("push with [redacted] refused");
  });

  it("an address's user and password, its secret parameters and a token in its path, keeping the rest", () => {
    expect(cutText("GET https://ana:pw@api.test/v1?sig=abc&page=2#top failed")).toBe(
      "GET https://api.test/v1?sig=[redacted]&page=2#top failed",
    );
    expect(
      cutText("POST https://hooks.test/services/T0001/B0001/XyZ4bc9dEf8ghI7jkL6mnO5p failed"),
    ).toBe("POST https://hooks.test/services/T0001/B0001/[redacted] failed");
    expect(cutText("could not reach ana:s3cret@db.internal:5432")).toBe(
      "could not reach [redacted]@db.internal:5432",
    );
  });

  it("a value longer than any bound whole, with no part of it left", () => {
    const long = `password=${"Zq9".repeat(400)} and more`;

    expect(cutText(long)).toBe("password=[redacted] and more");
  });
});

describe("what is kept", () => {
  it("prose that only names a credential", () => {
    for (const text of [
      "Token expired",
      "Basic authentication required",
      "Bearer token missing",
      "tokens: 3 of 5 used",
      "password: required",
      "api key: missing",
      "the session ended",
      "primary key=id, sort key=createdAt",
      "keyFile: /etc/ssl/key.pem",
    ]) {
      expect(cutText(text)).toBe(text);
    }
  });

  it("line breaks, and an address as it was written", () => {
    const advice =
      "Set COURIER_APP_URL=http://localhost:3000\nSee https://courier.example/docs/frameworks/nextjs#studio-app-origin";

    expect(cutText(advice)).toBe(advice);
  });

  it("a long text's start, cut to the length asked for", () => {
    expect(cutText("word ".repeat(20), 10)).toBe("word word…");
  });
});

describe("a text of any size", () => {
  const MEGABYTE = 1024 * 1024;
  const hostile = {
    "dotted names": "token.".repeat(MEGABYTE / 6),
    "dotted letters": "a.".repeat(MEGABYTE / 2),
    "names without a value": "token ".repeat(MEGABYTE / 6),
    "pairs without an end": "token=".repeat(MEGABYTE / 6),
    "pairs whose quote stays open": 'token="'.repeat(MEGABYTE / 7),
    "JWT starts": "eyJ-".repeat(MEGABYTE / 4),
    "schemes without a host": "a:/".repeat(MEGABYTE / 3),
    "quotes that never close": `"${"x".repeat(MEGABYTE)}`,
    "users without a host": " a:b".repeat(MEGABYTE / 4),
    "keys Postgres never closes": "Key (a".repeat(MEGABYTE / 6),
    "refused headers never closed": 'Headers.append: "x'.repeat(MEGABYTE / 18),
    /* Joined at run time, as the corpus's keys are, so no scanner takes the source for one. */
    "private keys never ended": ["-----BEGIN PRIVATE", " KEY-----"].join("").repeat(MEGABYTE / 27),
    "sign-in words with pairs": "auth a:bbbbbbbb ".repeat(MEGABYTE / 16),
    "one word": "x".repeat(MEGABYTE),
  };

  /* The fastest of three runs: one the machine's load or a collection held up says nothing of the reading. */
  const fastest = (run: () => void): number =>
    Math.min(
      ...[0, 1, 2].map(() => {
        const started = performance.now();
        run();
        return performance.now() - started;
      }),
    );

  /* Only the start is read — four times the length kept — so the budget is that start's, however long the text. */
  for (const [name, text] of Object.entries(hostile)) {
    it(`reads ${name} no further than its start, in tens of milliseconds`, () => {
      const cut = cutText(text);

      expect(
        fastest(() => {
          cutText(text);
          cutText(text, 300);
        }),
      ).toBeLessThan(100);
      expect(cut.length).toBeLessThanOrEqual(2000);
    });
  }

  it("shows no part of a single word longer than it reads", () => {
    expect(cutText("x".repeat(50), 10)).toBe("[redacted]");
  });

  it("drops the word the read ends inside, rather than show half of it", () => {
    const text = `${"word ".repeat(1599)}Bearer${"x".repeat(10)}`;

    expect(cutText(text, 2000)).not.toContain("Bearer");
  });
});
