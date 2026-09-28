/**
 * This machine's own addresses are this machine. The classifier judged an
 * address by its range alone, so the developer's global IPv6 address — or
 * any address of one of this machine's interfaces outside the loopback
 * ranges — counted as the public internet, and a server elsewhere could
 * redirect a specification fetch to the services listening here.
 */
import type * as Os from "node:os";
import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addressKindHere } from "../src/server/address-kind-here";
import { approveSpecAddresses } from "../src/server/approve-spec-addresses";
import type { LookupPolicy } from "../src/server/guarded-lookup";
import { canonicalAddress, isOwnAddress } from "../src/server/own-addresses";

const listed = vi.hoisted(() => vi.fn<() => NodeJS.Dict<NetworkInterfaceInfo[]>>(() => ({})));

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof Os>()),
  networkInterfaces: listed,
}));

const GLOBAL_V6 = "2a01:4f8:c0c:1234::1";
const PUBLIC_V4 = "198.51.99.20";

function info(address: string, family: "IPv4" | "IPv6"): NetworkInterfaceInfo {
  return family === "IPv4"
    ? { address, family, internal: false, netmask: "255.255.255.0", mac: "", cidr: null }
    : { address, family, internal: false, netmask: "ffff::", mac: "", cidr: null, scopeid: 0 };
}

const HERE = {
  lo0: [info("127.0.0.1", "IPv4"), info("fe80::1", "IPv6")],
  en0: [info("192.168.1.5", "IPv4"), info(PUBLIC_V4, "IPv4"), info(GLOBAL_V6, "IPv6")],
};

describe("addressKindHere", () => {
  it("counts an address of this machine's interfaces as this machine, whatever its range", () => {
    expect(addressKindHere(GLOBAL_V6, HERE)).toBe("loopback");
    expect(addressKindHere(PUBLIC_V4, HERE)).toBe("loopback");
    expect(addressKindHere("192.168.1.5", HERE)).toBe("loopback");
    expect(addressKindHere("::ffff:192.168.1.5", HERE)).toBe("loopback");
  });

  it("leaves every other address as its range makes it", () => {
    expect(addressKindHere("2a01:4f8:c0c:1234::2", HERE)).toBe("public");
    expect(addressKindHere("192.168.1.6", HERE)).toBe("private");
    expect(addressKindHere("0.0.0.0", HERE)).toBe("unspecified");
    expect(addressKindHere("127.0.0.2", HERE)).toBe("loopback");
  });

  it("does not count a link-local address as this machine, since other machines reuse them", () => {
    expect(addressKindHere("fe80::1", HERE)).toBe("private");
  });
});

describe("isOwnAddress", () => {
  it("matches an address in any spelling Node reports", () => {
    expect(isOwnAddress("2A01:04F8:0C0C:1234:0:0:0:1", HERE)).toBe(true);
    expect(isOwnAddress("::ffff:198.51.99.20", HERE)).toBe(true);
    expect(isOwnAddress(undefined, HERE)).toBe(false);
    expect(isOwnAddress("not an address", HERE)).toBe(false);
  });

  it("knows no address where the interfaces cannot be listed", () => {
    expect(isOwnAddress(GLOBAL_V6, {})).toBe(false);
  });
});

describe("canonicalAddress", () => {
  it("spells an address one way", () => {
    expect(canonicalAddress("::FFFF:127.0.0.1")).toBe("127.0.0.1");
    expect(canonicalAddress("fe80::1%lo0")).toBe("fe80::1");
    expect(canonicalAddress("127.0.0.1%lo0")).toBeNull();
  });
});

describe("approveSpecAddresses on this machine", () => {
  function policy(loopback: boolean): LookupPolicy & { asked: string[] } {
    const asked: string[] = [];
    return { loopback, asked, admitPrivate: async (what) => void asked.push(what) };
  }

  afterEach(() => {
    listed.mockReset();
  });

  it("asks the project before a server elsewhere sends the request to this machine's own address", async () => {
    listed.mockReturnValue(HERE);
    const sent = policy(false);

    await approveSpecAddresses([GLOBAL_V6], sent, (address) => `api.example.com (${address})`);

    expect(sent.asked).toEqual([`api.example.com (${GLOBAL_V6})`]);
  });

  it("lets the developer's own request reach this machine's own address", async () => {
    listed.mockReturnValue(HERE);
    const own = policy(true);

    await approveSpecAddresses([GLOBAL_V6], own, (address) => address);

    expect(own.asked).toEqual([]);
  });
});
