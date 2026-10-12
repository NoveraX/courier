/**
 * The proxies a public demo is reached through besides the one in front of
 * Studio — a CDN, a WAF, a DDoS filter — named by address or range, IPv4 and
 * IPv6, whose `X-Forwarded-For` entries Studio reads past, and the header
 * they name the visitor in.
 */
import { CourierError } from "@noverax/courier";
import { describe, expect, it } from "vitest";

import {
  NO_TRUSTED_PROXIES,
  plainAddress,
  trustedProxies,
} from "../../src/server/demo/trusted-proxies";

function refusal(entry: string, addressHeader?: string): CourierError {
  try {
    trustedProxies([entry], addressHeader);
  } catch (error) {
    if (error instanceof CourierError) return error;
    throw error;
  }
  throw new Error(`"${entry}" and "${addressHeader}" were taken`);
}

describe("trustedProxies", () => {
  it("knows the addresses of the ranges it is given, and only those", () => {
    const trusted = trustedProxies(["198.51.100.0/24", "2001:db8:100::/48"]);

    expect(trusted.has("198.51.100.7")).toBe(true);
    expect(trusted.has("198.51.101.7")).toBe(false);
    expect(trusted.has("2001:db8:100:5::9")).toBe(true);
    expect(trusted.has("2001:db8:101::9")).toBe(false);
  });

  it("knows a single address it is given, and not its neighbour", () => {
    const trusted = trustedProxies(["203.0.113.7", "2001:db8::7"]);

    expect(trusted.has("203.0.113.7")).toBe(true);
    expect(trusted.has("203.0.113.8")).toBe(false);
    expect(trusted.has("2001:db8::7")).toBe(true);
    expect(trusted.has("2001:db8::8")).toBe(false);
  });

  it("knows an address as a socket gives it: IPv4 that IPv6 maps, in brackets, with a zone", () => {
    const trusted = trustedProxies(["198.51.100.0/24", "fe80::/64"]);

    expect(trusted.has("::ffff:198.51.100.7")).toBe(true);
    expect(trusted.has("[2001:db8::1]")).toBe(false);
    expect(trusted.has("[fe80::1]")).toBe(true);
    expect(trusted.has("fe80::1%eth0")).toBe(true);
  });

  it("takes entries with the spaces a list split by commas leaves", () => {
    const trusted = trustedProxies([" 198.51.100.0/24 ", "203.0.113.7 "]);

    expect(trusted.has("198.51.100.1")).toBe(true);
    expect(trusted.has("203.0.113.7")).toBe(true);
  });

  it("knows nothing that is not an address", () => {
    const trusted = trustedProxies(["198.51.100.0/24"]);

    expect(trusted.has("unknown")).toBe(false);
    expect(trusted.has("")).toBe(false);
    expect(trusted.has("198.51.100")).toBe(false);
  });

  it("knows no proxy when it is given none", () => {
    expect(trustedProxies()).toBe(NO_TRUSTED_PROXIES);
    expect(trustedProxies([])).toBe(NO_TRUSTED_PROXIES);
    expect(NO_TRUSTED_PROXIES.has("198.51.100.7")).toBe(false);
  });

  it("refuses an entry that is neither an address nor a range of them, saying which", () => {
    for (const entry of [
      "ddos-filter.example",
      "198.51.100.0/33",
      "2001:db8::/129",
      "198.51.100.0/x",
      "198.51.100.0/",
      "198.51.100.0/24/8",
      "",
    ]) {
      const error = refusal(entry);

      expect(error.code).toBe("STUDIO_DEMO_PROXY_INVALID");
      expect(error.message).toContain(`"${entry}"`);
      expect(error.message).toContain("neither an address nor a range");
    }
  });

  it("refuses a range that takes in every address, which would believe any entry a visitor writes", () => {
    for (const entry of ["0.0.0.0/0", "::/0", "198.51.100.7/0"]) {
      const error = refusal(entry);

      expect(error.code).toBe("STUDIO_DEMO_PROXY_INVALID");
      expect(error.message).toContain("takes in every address");
    }
  });
});

describe("trustedProxies' address header", () => {
  it("names the header lower-cased, as Node gives headers", () => {
    expect(trustedProxies(["198.51.100.0/24"], " DDG-Connecting-IP ").addressHeader).toBe(
      "ddg-connecting-ip",
    );
  });

  it("names none when the demo names none", () => {
    expect(trustedProxies(["198.51.100.0/24"]).addressHeader).toBeUndefined();
    expect(trustedProxies(["198.51.100.0/24"], "  ").addressHeader).toBeUndefined();
  });

  it("refuses a header that is no header's name, saying which option it came from", () => {
    const error = refusal("198.51.100.0/24", "Connecting IP");

    expect(error.code).toBe("STUDIO_DEMO_PROXY_INVALID");
    expect(error.message).toContain('"Connecting IP" in the demo\'s addressHeader');
  });
});

describe("plainAddress", () => {
  it("is an address without brackets or a zone, and IPv4 where IPv6 maps it", () => {
    expect(plainAddress("[::ffff:10.0.1.4]")).toBe("10.0.1.4");
    expect(plainAddress("::FFFF:203.0.113.9")).toBe("203.0.113.9");
    expect(plainAddress("fe80::1%eth0")).toBe("fe80::1");
    expect(plainAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(plainAddress("203.0.113.9")).toBe("203.0.113.9");
  });
});
