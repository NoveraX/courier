/**
 * The address a public demo counts a visitor against: the connection's own,
 * or — from a proxy on this machine or a private network, or one the demo
 * trusts — the address the proxies reported, never one the visitor wrote
 * itself; an IPv6 subscriber by the /64 network it is given whole.
 */
import { describe, expect, it } from "vitest";

import { trustedProxies } from "../../src/server/demo/trusted-proxies";
import { visitorAddress } from "../../src/server/demo/visitor-address";

/* A DDoS filter in front of the demo's proxy, as its host names it. */
const FILTER = trustedProxies(["198.51.100.0/24", "2001:db8:f::/48"]);

describe("visitorAddress", () => {
  it("is a visitor's own address when it connects directly, whatever it claims", () => {
    /* A public address: the documentation ranges count as private networks. */
    expect(visitorAddress({ peer: "1.1.1.1", forwardedFor: "198.51.100.1" })).toBe("1.1.1.1");
  });

  it("is what a proxy reported, the last entry, when the proxy is on a private network", () => {
    const behindProxy = { peer: "10.0.1.4", forwardedFor: "1.2.3.4, 203.0.113.7" };

    expect(visitorAddress(behindProxy)).toBe("203.0.113.7");
  });

  it("reads past an empty last entry, and joins a header sent more than once", () => {
    expect(visitorAddress({ peer: "127.0.0.1", forwardedFor: "203.0.113.7, " })).toBe(
      "203.0.113.7",
    );
    expect(visitorAddress({ peer: "::1", forwardedFor: ["1.2.3.4", "203.0.113.8"] })).toBe(
      "203.0.113.8",
    );
  });

  it("is the proxy's own address when it reported none", () => {
    expect(visitorAddress({ peer: "::ffff:10.0.1.4", forwardedFor: undefined })).toBe("10.0.1.4");
  });

  it("counts an IPv6 subscriber by its /64 network", () => {
    const first = visitorAddress({ peer: "2001:db8:1:2:aaaa::1", forwardedFor: undefined });
    const second = visitorAddress({ peer: "2001:db8:1:2:bbbb::9", forwardedFor: undefined });

    expect(first).toBe("2001:db8:1:2::/64");
    expect(second).toBe(first);
    expect(visitorAddress({ peer: "2001:db8:1:3::1", forwardedFor: undefined })).not.toBe(first);
  });

  it("counts an IPv4 address IPv6 maps as the IPv4 address", () => {
    expect(visitorAddress({ peer: "::ffff:203.0.113.9", forwardedFor: undefined })).toBe(
      "203.0.113.9",
    );
  });

  it("reads past the entries a trusted filter appended, to the address the filter saw", () => {
    const behindFilter = { peer: "10.0.1.4", forwardedFor: "203.0.113.7, 198.51.100.9" };

    expect(visitorAddress(behindFilter, FILTER)).toBe("203.0.113.7");
    expect(visitorAddress(behindFilter)).toBe("198.51.100.9");
  });

  it("reads past a chain of trusted filters, IPv4 and IPv6 alike", () => {
    const chain = { peer: "::1", forwardedFor: ["203.0.113.7, 2001:db8:f::3", "198.51.100.9"] };

    expect(visitorAddress(chain, FILTER)).toBe("203.0.113.7");
  });

  it("never takes what a visitor wrote left of the address the filter saw", () => {
    const forged = {
      peer: "10.0.1.4",
      forwardedFor: "192.0.2.1, 198.51.100.4, 203.0.113.7, 198.51.100.9",
    };

    expect(visitorAddress(forged, FILTER)).toBe("203.0.113.7");
  });

  it("is the last entry when every entry is a trusted filter's", () => {
    const fromFilter = { peer: "10.0.1.4", forwardedFor: "198.51.100.4, 198.51.100.9" };

    expect(visitorAddress(fromFilter, FILTER)).toBe("198.51.100.9");
  });

  it("reads what a trusted filter reported when it connects to Studio itself", () => {
    expect(visitorAddress({ peer: "198.51.100.9", forwardedFor: "203.0.113.7" }, FILTER)).toBe(
      "203.0.113.7",
    );
    expect(
      visitorAddress({ peer: "::ffff:198.51.100.9", forwardedFor: "203.0.113.7" }, FILTER),
    ).toBe("203.0.113.7");
  });

  it("still counts a visitor that connects directly by its own address", () => {
    expect(visitorAddress({ peer: "1.1.1.1", forwardedFor: "198.51.100.9" }, FILTER)).toBe(
      "1.1.1.1",
    );
  });

  it("counts a visitor behind a filter by its /64 network when it came over IPv6", () => {
    const behindFilter = { peer: "10.0.1.4", forwardedFor: "2001:db8:1:2::77, 198.51.100.9" };

    expect(visitorAddress(behindFilter, FILTER)).toBe("2001:db8:1:2::/64");
  });
});
