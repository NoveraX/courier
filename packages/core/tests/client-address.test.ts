/**
 * The address of the user a request comes from — what an upstream receives
 * as `X-Forwarded-For` and what a limit counts — for every way a deployment
 * puts proxies in front of the application.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { addressTrust, deploymentTrust } from "../src/adapter/address-trust";
import { clientAddress } from "../src/adapter/client-address";

function headers(values: Record<string, string> = {}): (name: string) => string | null {
  const all = new Headers(values);
  return (name) => all.get(name);
}

const DDOS_GUARD = addressTrust(["192.0.2.0/24", "2001:db8:aa00::/40"], "DDG-Connecting-IP").trust;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a connection from a public address", () => {
  it("is the user, whatever the chain it sends claims", () => {
    expect(clientAddress("203.0.113.9", headers({ "x-forwarded-for": "1.2.3.4" }))).toBe(
      "203.0.113.9",
    );
  });

  it("is written as itself when IPv6 maps it, or a socket reports it with a zone", () => {
    expect(clientAddress("::ffff:203.0.113.9", headers())).toBe("203.0.113.9");
    expect(clientAddress("2001:DB8::7%eth0", headers())).toBe("2001:db8::7");
  });
});

describe("a connection from a proxy on this machine or a private network", () => {
  it("names the user by the last address the chain holds beyond the proxies", () => {
    const forged = headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });

    expect(clientAddress("127.0.0.1", forged)).toBe("203.0.113.7");
    expect(clientAddress("10.0.0.2", forged)).toBe("203.0.113.7");
  });

  it("reads past the private hops of a balancer in front of the proxy", () => {
    const chain = headers({ "x-forwarded-for": "203.0.113.7, 10.0.4.1, 172.20.0.3" });

    expect(clientAddress("10.0.0.2", chain)).toBe("203.0.113.7");
  });

  it("names the first address when every hop is on the private network", () => {
    const intranet = headers({ "x-forwarded-for": "10.1.2.3, 10.0.4.1" });

    expect(clientAddress("10.0.0.2", intranet)).toBe("10.1.2.3");
  });

  it("is itself the user when it forwards nothing", () => {
    expect(clientAddress("192.168.1.20", headers())).toBe("192.168.1.20");
  });

  it("names nobody when the hop it appended is no address", () => {
    expect(
      clientAddress("10.0.0.2", headers({ "x-forwarded-for": "203.0.113.7, unknown" })),
    ).toBeUndefined();
  });

  it("reads the addresses balancers write with a port", () => {
    expect(clientAddress("10.0.0.2", headers({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe(
      "203.0.113.7",
    );
    expect(clientAddress("10.0.0.2", headers({ "x-forwarded-for": "[2001:db8::7]:443" }))).toBe(
      "2001:db8::7",
    );
  });
});

describe("a runtime that does not report the connection", () => {
  it("names the user by the address the framework or the platform recorded last", () => {
    expect(clientAddress(undefined, headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("names nobody when nothing recorded one", () => {
    expect(clientAddress(undefined, headers())).toBeUndefined();
    expect(clientAddress(undefined, headers({ "x-real-ip": "203.0.113.7" }))).toBeUndefined();
  });
});

describe("a DDoS filter in front of the proxy", () => {
  it("is read past when it appended its own address to the chain", () => {
    const chain = headers({ "x-forwarded-for": "203.0.113.7, 192.0.2.17" });

    expect(clientAddress("10.0.0.2", chain, DDOS_GUARD)).toBe("203.0.113.7");
    expect(clientAddress(undefined, chain, DDOS_GUARD)).toBe("203.0.113.7");
  });

  it("names the user in its own header when the proxy kept only the filter's address", () => {
    const passed = headers({
      "x-forwarded-for": "192.0.2.17",
      "ddg-connecting-ip": "203.0.113.7",
    });

    expect(clientAddress("10.0.0.2", passed, DDOS_GUARD)).toBe("203.0.113.7");
    expect(clientAddress("192.0.2.17", passed, DDOS_GUARD)).toBe("203.0.113.7");
  });

  it("is not taken at its word by a request that did not come through it", () => {
    const direct = headers({ "x-forwarded-for": "198.51.100.4", "ddg-connecting-ip": "1.2.3.4" });

    expect(clientAddress("10.0.0.2", direct, DDOS_GUARD)).toBe("198.51.100.4");
    expect(clientAddress("198.51.100.4", direct, DDOS_GUARD)).toBe("198.51.100.4");
  });

  it("names nobody by a header that holds no address", () => {
    const passed = headers({ "x-forwarded-for": "192.0.2.17", "ddg-connecting-ip": "nobody" });

    expect(clientAddress("10.0.0.2", passed, DDOS_GUARD)).toBe("192.0.2.17");
  });

  it("is matched by its IPv6 ranges as well", () => {
    const chain = headers({ "x-forwarded-for": "2001:db8::7, 2001:db8:aa00:1::9" });

    expect(clientAddress("10.0.0.2", chain, DDOS_GUARD)).toBe("2001:db8::7");
  });
});

describe("the proxies the environment names", () => {
  it("are read from COURIER_TRUSTED_PROXIES and COURIER_CLIENT_ADDRESS_HEADER", () => {
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "192.0.2.0/24, 2001:db8:aa00::/40");
    vi.stubEnv("COURIER_CLIENT_ADDRESS_HEADER", "DDG-Connecting-IP");

    const trust = deploymentTrust();

    expect(trust.has("192.0.2.17")).toBe(true);
    expect(trust.has("198.51.100.200")).toBe(false);
    expect(trust.header).toBe("ddg-connecting-ip");
  });

  it("leave out an entry that is no address or range, and say so once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "192.0.2.0/24, 0.0.0.0/0, ::/0, 10.0.0.300, nonsense");

    const trust = deploymentTrust();
    deploymentTrust();

    expect(trust.has("192.0.2.17")).toBe(true);
    expect(trust.has("8.8.8.8")).toBe(false);
    expect(trust.has("2001:db8::1")).toBe(false);
    const said = warn.mock.calls.flat().join(" ");
    expect(said).toContain("0.0.0.0/0, ::/0, 10.0.0.300, nonsense");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("say that a header is read only from the proxies they name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "");
    vi.stubEnv("COURIER_CLIENT_ADDRESS_HEADER", "CF-Connecting-IP");

    const trust = deploymentTrust();

    expect(trust.header).toBeUndefined();
    expect(warn.mock.calls.flat().join(" ")).toContain("names none");
  });

  it("are none where the environment names none", () => {
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "");
    vi.stubEnv("COURIER_CLIENT_ADDRESS_HEADER", "");

    expect(deploymentTrust().has("192.0.2.17")).toBe(false);
  });
});
