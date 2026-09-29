import type * as Os from "node:os";
import type { NetworkInterfaceInfo } from "node:os";
import { networkInterfaces } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isLocalPeer } from "../../src/server/mocks-edit/is-local-peer";

const machine = vi.hoisted(() => ({ interfaces: {} as NodeJS.Dict<NetworkInterfaceInfo[]> }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof Os>();
  return { ...actual, networkInterfaces: vi.fn(() => machine.interfaces) };
});

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "02:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

function ipv6(address: string, scopeid = 0): NetworkInterfaceInfo {
  return {
    address,
    netmask: "ffff:ffff:ffff:ffff::",
    family: "IPv6",
    mac: "02:00:00:00:00:00",
    internal: false,
    cidr: `${address}/64`,
    scopeid,
  };
}

const INTERFACES: NodeJS.Dict<NetworkInterfaceInfo[]> = {
  lo0: [ipv4("127.0.0.1", true), ipv6("::1"), ipv6("fe80::1", 1)],
  en0: [
    ipv6("fe80::1cbd:d520:3ff9:dc87", 14),
    ipv4("192.168.0.42"),
    ipv6("2001:db8::a1b2"),
    ipv4("169.254.10.20"),
  ],
  utun0: undefined,
};

describe("a peer on the loopback", () => {
  it.each([
    "127.0.0.1",
    "127.3.4.5",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::FFFF:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:7f00:0001",
  ])("is local without looking at the interfaces: %s", (address) => {
    expect(isLocalPeer(address, {})).toBe(true);
  });
});

describe("a peer at one of this machine's own addresses", () => {
  it.each([
    "192.168.0.42",
    "::ffff:192.168.0.42",
    "2001:db8::a1b2",
    "2001:DB8::A1B2",
    "2001:DB8::A1B2%en0",
    "2001:db8:0:0:0:0:0:a1b2",
  ])("is local: %s", (address) => {
    expect(isLocalPeer(address, INTERFACES)).toBe(true);
  });

  it.each([
    "fe80::1cbd:d520:3ff9:dc87",
    "FE80::1CBD:D520:3FF9:DC87%en0",
    "fe80::1",
    "169.254.10.20",
    "::ffff:169.254.10.20",
  ])("is not local when the address is link-local: %s", (address) => {
    expect(isLocalPeer(address, INTERFACES)).toBe(false);
  });

  /* fe80::/10 ends at febf::; fec0:: is the first address past it. */
  it.each([
    ["febf:ffff::5", false],
    ["fec0::5", true],
  ])("reads %s as link-local only inside fe80::/10 (local: %s)", (address, local) => {
    const interfaces = { en1: [ipv6("febf:ffff::5", 4), ipv6("fec0::5")] };

    expect(isLocalPeer(address, interfaces)).toBe(local);
  });
});

describe("any other peer", () => {
  it.each([
    "192.168.0.43",
    "::ffff:192.168.0.43",
    "203.0.113.9",
    "2001:db8::a1b3",
    "::7f00:1",
    "::127.0.0.1",
    "127.0.0.1%lo0",
    "localhost",
    "not an address",
    "",
    undefined,
  ])("is not local: %s", (address) => {
    expect(isLocalPeer(address, INTERFACES)).toBe(false);
  });
});

describe("reading this machine's interfaces", () => {
  afterEach(() => {
    vi.mocked(networkInterfaces).mockClear();
    vi.restoreAllMocks();
  });

  it("reads them again on every call", () => {
    machine.interfaces = { en0: [ipv4("10.0.0.7")] };
    const whileConnected = isLocalPeer("10.0.0.7");
    machine.interfaces = { en0: [ipv4("10.0.1.9")] };
    const afterMoving = isLocalPeer("10.0.0.7");

    expect(whileConnected).toBe(true);
    expect(afterMoving).toBe(false);
  });

  it("does not read them for a loopback peer", () => {
    machine.interfaces = { en0: [ipv4("10.0.0.7")] };

    isLocalPeer("::ffff:127.0.0.1");
    const readsForLoopback = vi.mocked(networkInterfaces).mock.calls.length;
    isLocalPeer("10.0.0.7");

    expect(readsForLoopback).toBe(0);
    expect(networkInterfaces).toHaveBeenCalledTimes(1);
  });

  it("counts only the loopback, and says why, when they cannot be read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("uv_interface_addresses returned Unknown system error 1");
    machine.interfaces = { en0: [ipv4("10.0.0.7")] };
    vi.mocked(networkInterfaces).mockImplementationOnce(() => {
      throw failure;
    });

    const local = isLocalPeer("10.0.0.7");

    expect(local).toBe(false);
    const [call] = warn.mock.calls;
    expect(call).toBeDefined();
    expect(String(call?.[1])).toContain("Studio could not list this machine's network addresses");
    expect(call).toContain(failure);
  });
});
