/**
 * The key the proxy's limit counts a caller by, given an address: an IPv4
 * address as it is, however it is written, an IPv6 address by its /64
 * network, and one unknown caller for no address or anything else.
 */
import { describe, expect, it } from "vitest";

import { callerKeyOf } from "../../src/server";

describe("callerKeyOf", () => {
  it("keeps an IPv4 address as it is, written alone, with a port or as IPv6 maps it", () => {
    expect(callerKeyOf("198.51.100.23")).toBe("198.51.100.23");
    expect(callerKeyOf("198.51.100.23:51234")).toBe("198.51.100.23");
    expect(callerKeyOf("::ffff:198.51.100.23")).toBe("198.51.100.23");
  });

  it("counts an IPv6 address by its /64 network, however the address is written", () => {
    expect(callerKeyOf("2001:db8:0:7::12")).toBe("2001:db8:0:7::/64");
    expect(callerKeyOf("2001:0db8:0000:0007:ffff:ffff:ffff:ffff")).toBe("2001:db8:0:7::/64");
    expect(callerKeyOf("[2001:db8:0:7::1]:443")).toBe("2001:db8:0:7::/64");
    expect(callerKeyOf("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(callerKeyOf("2001:db8:0:8::1")).toBe("2001:db8:0:8::/64");
  });

  it("counts no address, and anything that is not one, as one unknown caller", () => {
    expect(callerKeyOf(undefined)).toBe("unknown");
    expect(callerKeyOf("")).toBe("unknown");
    expect(callerKeyOf("not an address")).toBe("unknown");
    expect(callerKeyOf("198.51.100.256")).toBe("unknown");
  });
});
