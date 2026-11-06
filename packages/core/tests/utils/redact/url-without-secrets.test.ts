/**
 * An address with what could be a credential cut out, and the rest as it
 * was written.
 */
import { describe, expect, it } from "vitest";

import { urlWithoutSecrets } from "../../../src/utils/redact/url-without-secrets";

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

  it("loses a user and a password in every spelling a URL parser reads them in", () => {
    const spellings = [
      "https://ana:pw@api.test/openapi.json",
      "HTTPS://ana:pw@api.test/openapi.json",
      "https://ana%40corp:pw@api.test/openapi.json",
      "https://ana:pw@[::1]:8443/openapi.json",
      " https://ana:pw@api.test/openapi.json",
      "\thttps://ana:pw@api.test/openapi.json",
      "https:/ana:pw@api.test/openapi.json",
      "https:\\\\ana:pw@api.test/openapi.json",
      "https:\\\\deploy:Zq9x-made-up-secret-77@api.example.com/openapi.json",
      "https:ana:pw@api.test/openapi.json",
      " ht\ttps://ana:pw@api.test/openapi.json?api_key=k3y",
    ];
    for (const address of spellings) {
      const shown = urlWithoutSecrets(address);
      const read = new URL(shown.trim());

      expect([read.username, read.password]).toEqual(["", ""]);
      expect(shown).not.toMatch(/ana|deploy|Zq9x|k3y/);
    }
    expect(urlWithoutSecrets("https:\\\\ana:pw@api.test/openapi.json?page=2&api_key=k3y")).toBe(
      "https://api.test/openapi.json?page=2&api_key=[redacted]",
    );
  });

  it("keeps an address with no credentials as written, a space before it and all", () => {
    for (const address of [
      " https://api.test/openapi.json",
      "HTTPS://API.test",
      "https:/api.test",
    ]) {
      expect(urlWithoutSecrets(address)).toBe(address);
    }
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
