/**
 * A text with each address in it cut, and a `user:password@` written
 * before a host without a scheme.
 */
import { describe, expect, it } from "vitest";

import { urlsWithoutSecrets } from "../../src/secrets/urls-without-secrets";

describe("the addresses in a text", () => {
  it("are cut where they stand, the words around them kept", () => {
    expect(urlsWithoutSecrets("GET https://ana:pw@api.test/v1?sig=abc123 failed (retrying)")).toBe(
      "GET https://api.test/v1?sig=[redacted] failed (retrying)",
    );
  });

  it("include a user and password written before a host with no scheme", () => {
    expect(urlsWithoutSecrets("connect to ana:hunter2@db.internal:5432 refused")).toBe(
      "connect to [redacted]@db.internal:5432 refused",
    );
  });

  it("leave a text with no address as it was", () => {
    expect(urlsWithoutSecrets("Token expired: sign in again")).toBe("Token expired: sign in again");
  });
});
