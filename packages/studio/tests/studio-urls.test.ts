/**
 * The addresses Studio's banner prints.
 *
 * It printed the first network address the machine had whatever Studio was
 * bound to — under the default `localhost`, an address nothing listened on —
 * and printed wildcard and IPv6 hosts as they were written.
 */
import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";

import { studioUrls, tokenLink, withToken } from "../src/server/studio-urls";

const INTERFACES: Record<string, NetworkInterfaceInfo[]> = {
  lo0: [
    {
      address: "127.0.0.1",
      family: "IPv4",
      internal: true,
      netmask: "255.0.0.0",
      mac: "",
      cidr: null,
    },
  ],
  en0: [
    {
      address: "192.0.2.10",
      family: "IPv4",
      internal: false,
      netmask: "255.255.255.0",
      mac: "",
      cidr: null,
    },
    {
      address: "fe80::1",
      family: "IPv6",
      internal: false,
      netmask: "ffff::",
      mac: "",
      cidr: null,
      scopeid: 4,
    },
    {
      address: "2001:db8::5",
      family: "IPv6",
      internal: false,
      netmask: "ffff::",
      mac: "",
      cidr: null,
      scopeid: 0,
    },
  ],
};

describe("studioUrls", () => {
  it("lists nothing on the network for a loopback bind", () => {
    expect(studioUrls("localhost", 6280, INTERFACES)).toEqual({
      local: "http://localhost:6280",
      network: [],
    });
    expect(studioUrls("::1", 6280, INTERFACES)).toEqual({
      local: "http://[::1]:6280",
      network: [],
    });
  });

  it("lists every IPv4 address for an IPv4 wildcard", () => {
    expect(studioUrls("0.0.0.0", 6280, INTERFACES)).toEqual({
      local: "http://localhost:6280",
      network: ["http://192.0.2.10:6280"],
    });
  });

  it("adds routable IPv6 addresses for an IPv6 wildcard, never link-local ones", () => {
    expect(studioUrls("::", 6280, INTERFACES).network).toEqual([
      "http://192.0.2.10:6280",
      "http://[2001:db8::5]:6280",
    ]);
  });

  it("lists only the address a specific bind listens on", () => {
    expect(studioUrls("192.0.2.10", 6280, INTERFACES)).toEqual({
      network: ["http://192.0.2.10:6280"],
    });
  });
});

describe("tokenLink", () => {
  it("carries the token in the fragment, which no request sends", () => {
    expect(tokenLink("http://localhost:6280", "k3y")).toBe("http://localhost:6280/#token=k3y");
    expect(tokenLink("http://[::1]:6280/", "k3y")).toBe("http://[::1]:6280/#token=k3y");
  });
});

describe("withToken", () => {
  it("gives every address the token", () => {
    expect(
      withToken({ local: "http://localhost:6280", network: ["http://192.0.2.10:6280"] }, "k3y"),
    ).toEqual({
      local: "http://localhost:6280/#token=k3y",
      network: ["http://192.0.2.10:6280/#token=k3y"],
    });
    expect(withToken({ network: ["http://192.0.2.10:6280"] }, "k3y")).toEqual({
      network: ["http://192.0.2.10:6280/#token=k3y"],
    });
  });
});
