/**
 * An address with what could be a credential cut out, and the rest as it
 * was written.
 */
import { describe, expect, it } from "vitest";

import { urlWithoutSecrets } from "../../src/server/secrets/url-without-secrets";

describe("an address", () => {
  it("loses its user and password, and the value of each parameter its name gives away", () => {
    expect(urlWithoutSecrets("https://ana:pw@api.test/v1/users?page=2&api_key=k3y&sig=abc")).toBe(
      "https://api.test/v1/users?page=2&api_key=[redacted]&sig=[redacted]",
    );
  });

  it("loses a parameter's value that reads as a token, and a path segment that does", () => {
    const token = "Zq9x7Kp2Lm4Nb6Vc8Xz1Qw3E";

    expect(urlWithoutSecrets(`https://hooks.test/T0/${token}?state=${token}`)).toBe(
      "https://hooks.test/T0/[redacted]?state=[redacted]",
    );
  });

  it("keeps its numbers, a UUID, a file's name, a page's anchor, and a path with no host", () => {
    const kept = [
      "https://api.test/v1/orders/123e4567-e89b-12d3-a456-426614174000?page=2#items",
      "https://files.test/report-2026-10-18-final-v2.pdf",
      "/api/users?limit=20",
    ];
    for (const address of kept) expect(urlWithoutSecrets(address)).toBe(address);
  });
});
