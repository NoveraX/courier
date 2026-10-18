/**
 * A text with what could be a credential cut out, each rule on its own:
 * what the platform quoted, keys of a known form, what follows a scheme or
 * a credential's name — and what is only spoken of kept.
 */
import { describe, expect, it } from "vitest";

import { textWithoutSecrets } from "../../src/server/secrets/text-without-secrets";

describe("a text's credentials", () => {
  it("are cut where the platform quoted a header value", () => {
    expect(
      textWithoutSecrets('Headers.append: "Bearer B34rer\nx" is an invalid header value.'),
    ).toBe('Headers.append: "[redacted]" is an invalid header value.');
  });

  it("are cut in a private key, a JWT and a provider's key", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLWlzLWhlcmU";
    /* A key's markers joined at run time, so no scanner takes the source for one. */
    const [begin, end] = [
      ["-----BEGIN PRIVATE", " KEY-----"],
      ["-----END PRIVATE", " KEY-----"],
    ].map((parts) => parts.join(""));
    const said = `pem ${begin}\nMIIB\n${end} jwt ${jwt} gh ghp_${"a".repeat(36)}`;

    expect(textWithoutSecrets(said)).toBe("pem [redacted] jwt [redacted] gh [redacted]");
  });

  it("are cut after an authorization scheme, but not the name of a challenge's parameter", () => {
    expect(textWithoutSecrets("sent Authorization: Bearer Zq9x7Kp2")).toBe(
      "sent Authorization: Bearer [redacted]",
    );
    expect(textWithoutSecrets('WWW-Authenticate: Basic realm="Restricted"')).toBe(
      'WWW-Authenticate: Basic realm="Restricted"',
    );
  });

  it("are a strong name's value always, a weak one's only when it reads as a credential", () => {
    expect(textWithoutSecrets("refused password=hunter and key=id")).toBe(
      "refused password=[redacted] and key=id",
    );
    expect(textWithoutSecrets("refused key=Zq9x7Kp2")).toBe("refused key=[redacted]");
  });

  it("are the values Postgres quoted for a secret column", () => {
    expect(textWithoutSecrets("Key (api_key)=(Zq9x7Kp2Lm) already exists.")).toBe(
      "Key (api_key)=([redacted]) already exists.",
    );
  });

  it("leave a text that only speaks of a credential as it was", () => {
    for (const said of ["Token expired", "tokens: 3 of 5 used", "keyFile: /etc/ssl/key.pem"]) {
      expect(textWithoutSecrets(said)).toBe(said);
    }
  });
});
