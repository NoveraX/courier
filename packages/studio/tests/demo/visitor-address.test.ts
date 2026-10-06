/**
 * The address a public demo counts a visitor against: the connection's own,
 * or — from a proxy on this machine or a private network — the address the
 * proxy reported, never one the visitor wrote itself; an IPv6 subscriber by
 * the /64 network it is given whole.
 */
import { describe, expect, it } from "vitest";

import { visitorAddress } from "../../src/server/demo/visitor-address";

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
});
