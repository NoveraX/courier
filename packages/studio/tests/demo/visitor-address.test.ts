/**
 * The address a public demo counts a visitor against: the connection's own,
 * or — from a proxy on this machine or a private network, or one the demo
 * trusts — the address the proxies reported, never one the visitor wrote
 * itself; an IPv6 subscriber by the /64 network it is given whole.
 */
import type { IncomingHttpHeaders } from "node:http";
import { describe, expect, it } from "vitest";

import { trustedProxies } from "../../src/server/demo/trusted-proxies";
import { type VisitorConnection, visitorAddress } from "../../src/server/demo/visitor-address";

/* A DDoS filter in front of the demo's proxy, as its host names it. */
const FILTER = trustedProxies(["198.51.100.0/24", "2001:db8:f::/48"]);
/* The same filter, which also names the address that connected to it in a header of its own. */
const NAMING_FILTER = trustedProxies(["198.51.100.0/24"], "DDG-Connecting-IP");

/* A connection from `peer`, with `X-Forwarded-For` and any other headers it carried. */
function from(
  peer: string,
  forwardedFor?: string | string[],
  headers: IncomingHttpHeaders = {},
): VisitorConnection {
  return {
    peer,
    headers: forwardedFor === undefined ? headers : { ...headers, "x-forwarded-for": forwardedFor },
  };
}

describe("visitorAddress", () => {
  it("is a visitor's own address when it connects directly, whatever it claims", () => {
    /* A public address: the documentation ranges count as private networks. */
    expect(visitorAddress(from("1.1.1.1", "198.51.100.1"))).toBe("1.1.1.1");
  });

  it("is what a proxy reported, the last entry, when the proxy is on a private network", () => {
    expect(visitorAddress(from("10.0.1.4", "1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
  });

  it("reads past an empty last entry, and joins a header sent more than once", () => {
    expect(visitorAddress(from("127.0.0.1", "203.0.113.7, "))).toBe("203.0.113.7");
    expect(visitorAddress(from("::1", ["1.2.3.4", "203.0.113.8"]))).toBe("203.0.113.8");
  });

  it("is the proxy's own address when it reported none", () => {
    expect(visitorAddress(from("::ffff:10.0.1.4"))).toBe("10.0.1.4");
  });

  it("is unknown when neither the connection nor a proxy says", () => {
    expect(visitorAddress({ peer: undefined, headers: {} })).toBe("unknown");
  });

  it("counts an IPv6 subscriber by its /64 network", () => {
    const first = visitorAddress(from("2001:db8:1:2:aaaa::1"));
    const second = visitorAddress(from("2001:db8:1:2:bbbb::9"));

    expect(first).toBe("2001:db8:1:2::/64");
    expect(second).toBe(first);
    expect(visitorAddress(from("2001:db8:1:3::1"))).not.toBe(first);
  });

  it("counts an IPv4 address IPv6 maps as the IPv4 address", () => {
    expect(visitorAddress(from("::ffff:203.0.113.9"))).toBe("203.0.113.9");
  });

  it("reads past the entries a trusted filter appended, to the address the filter saw", () => {
    const behindFilter = from("10.0.1.4", "203.0.113.7, 198.51.100.9");

    expect(visitorAddress(behindFilter, FILTER)).toBe("203.0.113.7");
    expect(visitorAddress(behindFilter)).toBe("198.51.100.9");
  });

  it("reads past a chain of trusted filters, IPv4 and IPv6 alike", () => {
    const chain = from("::1", ["203.0.113.7, 2001:db8:f::3", "198.51.100.9"]);

    expect(visitorAddress(chain, FILTER)).toBe("203.0.113.7");
  });

  it("never takes what a visitor wrote left of the address the filter saw", () => {
    const forged = from("10.0.1.4", "192.0.2.1, 198.51.100.4, 203.0.113.7, 198.51.100.9");

    expect(visitorAddress(forged, FILTER)).toBe("203.0.113.7");
  });

  it("is the last entry when every entry is a trusted filter's", () => {
    expect(visitorAddress(from("10.0.1.4", "198.51.100.4, 198.51.100.9"), FILTER)).toBe(
      "198.51.100.9",
    );
  });

  it("reads what a trusted filter reported when it connects to Studio itself", () => {
    expect(visitorAddress(from("198.51.100.9", "203.0.113.7"), FILTER)).toBe("203.0.113.7");
    expect(visitorAddress(from("::ffff:198.51.100.9", "203.0.113.7"), FILTER)).toBe("203.0.113.7");
  });

  it("still counts a visitor that connects directly by its own address", () => {
    expect(visitorAddress(from("1.1.1.1", "198.51.100.9"), FILTER)).toBe("1.1.1.1");
  });

  it("counts a visitor behind a filter by its /64 network when it came over IPv6", () => {
    const behindFilter = from("10.0.1.4", "2001:db8:1:2::77, 198.51.100.9");

    expect(visitorAddress(behindFilter, FILTER)).toBe("2001:db8:1:2::/64");
  });
});

describe("visitorAddress with a filter that names the visitor in a header", () => {
  const NAMED = { "ddg-connecting-ip": "203.0.113.7" };

  it("takes the header when the proxy in front of Studio replaced X-Forwarded-For with the filter's address", () => {
    expect(visitorAddress(from("10.0.1.4", "198.51.100.9", NAMED), NAMING_FILTER)).toBe(
      "203.0.113.7",
    );
  });

  it("takes the header when the filter connects to Studio itself", () => {
    expect(visitorAddress(from("198.51.100.9", undefined, NAMED), NAMING_FILTER)).toBe(
      "203.0.113.7",
    );
  });

  it("ignores the header from a visitor that came past the filter, counting it by its own address", () => {
    const direct = from("10.0.1.4", "192.0.2.50", { "ddg-connecting-ip": "203.0.113.200" });

    expect(visitorAddress(direct, NAMING_FILTER)).toBe("192.0.2.50");
    expect(visitorAddress(from("1.1.1.1", undefined, NAMED), NAMING_FILTER)).toBe("1.1.1.1");
  });

  it("ignores a header that holds no address, and reads X-Forwarded-For instead", () => {
    const garbled = from("10.0.1.4", "203.0.113.7, 198.51.100.9", {
      "ddg-connecting-ip": "unknown",
    });

    expect(visitorAddress(garbled, NAMING_FILTER)).toBe("203.0.113.7");
  });

  it("reads the last address of a header that lists several", () => {
    const listed = from("10.0.1.4", "198.51.100.9", {
      "ddg-connecting-ip": "192.0.2.1, 203.0.113.7",
    });

    expect(visitorAddress(listed, NAMING_FILTER)).toBe("203.0.113.7");
  });

  it("never reads a header the demo did not name", () => {
    expect(visitorAddress(from("10.0.1.4", "198.51.100.9", NAMED), FILTER)).toBe("198.51.100.9");
  });

  it("counts a visitor the header names over IPv6 by its /64 network", () => {
    const named = from("10.0.1.4", "198.51.100.9", { "ddg-connecting-ip": "2001:db8:5:6::1" });

    expect(visitorAddress(named, NAMING_FILTER)).toBe("2001:db8:5:6::/64");
  });
});
