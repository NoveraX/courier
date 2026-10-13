/**
 * Which address a WebSocket connection is counted against, when a Node
 * adapter knows the socket's own address.
 *
 * Forwarding headers are read only from a local or private peer, so a forged
 * `X-Forwarded-For` does not switch the per-address cap off; and a direct
 * caller that sends none is counted by its own address, not in one bucket
 * that one client could fill for everyone.
 */
import { describe, expect, it } from "vitest";

import { isLocalAddress, rememberPeerAddress } from "../src/adapter/peer-address";
import { extractClientIP } from "../src/adapter/ws-ip-tracker";

function requestFrom(peer: string | undefined, headers: Record<string, string> = {}): Request {
  const request = new Request("http://app.local/api/ws", { headers });
  rememberPeerAddress(request, peer);
  return request;
}

describe("a caller on a public address", () => {
  it("is counted by its own address, whatever header it sends", () => {
    const request = requestFrom("203.0.113.9", { "x-forwarded-for": "1.2.3.4" });
    expect(extractClientIP(request)).toBe("203.0.113.9");
  });

  it("gets a bucket of its own without sending any header", () => {
    expect(extractClientIP(requestFrom("203.0.113.9"))).toBe("203.0.113.9");
    expect(extractClientIP(requestFrom("198.51.100.4"))).toBe("198.51.100.4");
  });
});

describe("a reverse proxy on a local address", () => {
  it("is believed about the caller", () => {
    const request = requestFrom("127.0.0.1", { "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(extractClientIP(request)).toBe("203.0.113.9");
  });

  it("is itself the caller when it forwards nothing", () => {
    expect(extractClientIP(requestFrom("::ffff:10.0.0.5"))).toBe("10.0.0.5");
  });
});

describe("a runtime that records no address", () => {
  it("still reads the forwarding headers", () => {
    const request = requestFrom(undefined, { "x-forwarded-for": "203.0.113.9" });
    expect(extractClientIP(request)).toBe("203.0.113.9");
  });
});

describe("isLocalAddress", () => {
  it.each([
    "127.0.0.1",
    "::1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.0.1",
    "::ffff:192.168.0.2",
    "fd12:3456::1",
    "fe80::1",
  ])("treats %s as local", (address) => {
    expect(isLocalAddress(address)).toBe(true);
  });

  it.each(["203.0.113.9", "172.32.0.1", "8.8.8.8", "2001:db8::1", "::ffff:8.8.8.8"])(
    "treats %s as public",
    (address) => {
      expect(isLocalAddress(address)).toBe(false);
    },
  );
});
