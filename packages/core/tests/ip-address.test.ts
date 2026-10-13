/**
 * Reading IPv4 and IPv6 addresses and ranges the way the trust in proxies
 * compares them, on any runtime: no `node:net`, which an edge function lacks.
 */
import { describe, expect, it } from "vitest";

import {
  type AddressRange,
  inRange,
  type ParsedAddress,
  parseAddress,
  parseRange,
  plainAddress,
} from "../src/utils/ip-address";

function address(text: string): ParsedAddress {
  const parsed = parseAddress(text);
  if (parsed === undefined) throw new Error(`${text} is not read as an address`);
  return parsed;
}

function range(text: string): AddressRange {
  const parsed = parseRange(text);
  if (parsed === undefined) throw new Error(`${text} is not read as a range`);
  return parsed;
}

describe("plainAddress", () => {
  it.each([
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7:51234", "203.0.113.7"],
    ["[2001:db8::1]:443", "2001:db8::1"],
    ["[2001:db8::1]", "2001:db8::1"],
    ["fe80::1%eth0", "fe80::1"],
    ["2001:db8::1", "2001:db8::1"],
  ])("reads %j as %j", (written, plain) => {
    expect(plainAddress(written)).toBe(plain);
  });
});

describe("parseAddress", () => {
  it("reads IPv4", () => {
    expect(parseAddress("0.0.0.0")).toEqual({ family: 4, value: 0n });
    expect(parseAddress("255.255.255.255")).toEqual({ family: 4, value: 0xffffffffn });
    expect(parseAddress("10.0.0.7")).toEqual({ family: 4, value: 0x0a000007n });
  });

  it.each(["256.0.0.1", "10.0.0", "10.0.0.0.1", "010.0.0.1", "1.2.3.-4", "", "a.b.c.d"])(
    "refuses %j",
    (text) => {
      expect(parseAddress(text)).toBeUndefined();
    },
  );

  it("reads IPv6, compressed or whole", () => {
    expect(parseAddress("::")).toEqual({ family: 6, value: 0n });
    expect(parseAddress("::1")).toEqual({ family: 6, value: 1n });
    expect(parseAddress("2001:db8::1")).toEqual(parseAddress("2001:0db8:0:0:0:0:0:1"));
    expect(parseAddress("2001:DB8::")?.value).toBe(0x20010db8n << 96n);
    expect(parseAddress("64:ff9b::192.0.2.33")?.value).toBe((0x64ff9bn << 96n) | 0xc0000221n);
  });

  it("reads an IPv4 address IPv6 maps as the IPv4 address it is", () => {
    expect(parseAddress("::ffff:10.0.0.7")).toEqual({ family: 4, value: 0x0a000007n });
    expect(parseAddress("::ffff:a00:7")).toEqual({ family: 4, value: 0x0a000007n });
  });

  it.each(["1::2::3", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7", "12345::", ":1:2:3:4:5:6:7", "::g"])(
    "refuses %j",
    (text) => {
      expect(parseAddress(text)).toBeUndefined();
    },
  );
});

describe("parseRange and inRange", () => {
  it("matches an address inside an IPv4 range and none outside it", () => {
    const network = range("192.0.2.0/24");

    expect(inRange(address("192.0.2.0"), network)).toBe(true);
    expect(inRange(address("192.0.2.255"), network)).toBe(true);
    expect(inRange(address("192.0.3.0"), network)).toBe(false);
  });

  it("matches an IPv6 range, and never across families", () => {
    const network = range("2001:db8:aa00::/40");

    expect(inRange(address("2001:db8:aaff::1"), network)).toBe(true);
    expect(inRange(address("2001:db8:ab00::1"), network)).toBe(false);
    expect(inRange(address("10.0.0.1"), network)).toBe(false);
  });

  it("reads an address alone as a range of one", () => {
    const one = range("203.0.113.7");

    expect(one.bits).toBe(32);
    expect(inRange(address("203.0.113.7"), one)).toBe(true);
    expect(inRange(address("203.0.113.8"), one)).toBe(false);
  });

  it.each(["10.0.0.0/33", "2001:db8::/129", "10.0.0.0/x", "10.0.0.0/8/8", "nonsense/8"])(
    "refuses %j",
    (text) => {
      expect(parseRange(text)).toBeUndefined();
    },
  );
});
