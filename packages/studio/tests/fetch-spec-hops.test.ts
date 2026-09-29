/**
 * What each hop of a specification fetch may reach, and which hosts the
 * project's list admits. This machine stays reachable only while every hop
 * so far was on it, so a server elsewhere cannot send the request back here.
 * An entry with a port admits a URL that names no port when that port is
 * its scheme's default. The request itself is replaced, since the hops that
 * matter run through hosts a test cannot serve.
 */
import type * as Os from "node:os";
import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LookupPolicy } from "../src/server/guarded-lookup";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";
import type { SpecAnswer } from "../src/server/spec-request";

const requestSpec = vi.hoisted(() =>
  vi.fn<(url: URL, policy: LookupPolicy, timeoutMs: number) => Promise<SpecAnswer>>(),
);

vi.mock("../src/server/spec-request", () => ({ requestSpec }));

/* This machine, with a global IPv6 address beside its loopback one. */
const OWN_V6 = "2a01:4f8:c0c:1234::1";
const listed = vi.hoisted(() => vi.fn<() => NodeJS.Dict<NetworkInterfaceInfo[]>>(() => ({})));

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof Os>()),
  networkInterfaces: listed,
}));

const { fetchSpec } = await import("../src/server/fetch-spec");

/* A project whose courier.config loads and names no private host. */
const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });

function listing(...hosts: string[]): SpecHostAllowlist {
  return async () => ({ state: "listed", hosts });
}

function redirect(location: string, remoteAddress: string): SpecAnswer {
  return { kind: "redirect", location, remoteAddress };
}

/* Each hop's URL, and whether its policy lets it reach this machine. */
function hops(): Array<[string, boolean]> {
  return requestSpec.mock.calls.map(([url, policy]): [string, boolean] => [
    url.href,
    policy.loopback,
  ]);
}

/* A private host answers once the project admits it, as the lookup would ask. */
function answerOnceAdmitted(): void {
  requestSpec.mockImplementationOnce(async (url, policy) => {
    await policy.admitPrivate(url.host);
    return { kind: "body", text: "spec", remoteAddress: "10.0.0.7" };
  });
}

afterEach(() => {
  requestSpec.mockReset();
  listed.mockReset();
});

describe("fetchSpec hops", () => {
  it("does not let a server elsewhere send a request from this machine back to it", async () => {
    requestSpec
      .mockResolvedValueOnce(redirect("https://docs.example.com/spec.json", "127.0.0.1"))
      .mockResolvedValueOnce(redirect("http://127.0.0.1:6280/api/apis", "93.184.215.14"))
      .mockResolvedValueOnce({ kind: "body", text: "spec", remoteAddress: "127.0.0.1" });

    await fetchSpec("http://localhost:3000/spec.json", NOTHING_LISTED);

    expect(hops()).toEqual([
      ["http://localhost:3000/spec.json", true],
      ["https://docs.example.com/spec.json", true],
      ["http://127.0.0.1:6280/api/apis", false],
    ]);
  });

  it("keeps this machine reachable while every hop stays on it", async () => {
    requestSpec
      .mockResolvedValueOnce(redirect("http://localhost:3000/v2/spec.json", "127.0.0.1"))
      .mockResolvedValueOnce(redirect("http://127.0.0.1:3001/spec.json", "::1"))
      .mockResolvedValueOnce({ kind: "body", text: "spec", remoteAddress: "127.0.0.1" });

    expect(await fetchSpec("http://localhost:3000/spec.json", NOTHING_LISTED)).toBe("spec");

    expect(hops().map(([, loopback]) => loopback)).toEqual([true, true, true]);
  });

  it("keeps this machine reachable from a hop at one of its own addresses", async () => {
    listed.mockReturnValue({
      en0: [
        {
          address: OWN_V6,
          family: "IPv6",
          internal: false,
          netmask: "ffff::",
          mac: "",
          cidr: null,
          scopeid: 0,
        },
      ],
    });
    requestSpec
      .mockResolvedValueOnce(redirect("http://localhost:3000/spec.json", OWN_V6))
      .mockResolvedValueOnce({ kind: "body", text: "spec", remoteAddress: "127.0.0.1" });

    await fetchSpec(`http://[${OWN_V6}]:3000/spec.json`, NOTHING_LISTED);

    expect(hops().map(([, loopback]) => loopback)).toEqual([true, true]);
  });

  it("does not reach this machine from a redirect by a public host", async () => {
    requestSpec
      .mockResolvedValueOnce(redirect("http://localhost:6280/api/apis", "93.184.215.14"))
      .mockResolvedValueOnce({ kind: "body", text: "spec", remoteAddress: "127.0.0.1" });

    await fetchSpec("https://docs.example.com/spec.json", NOTHING_LISTED);

    expect(hops()).toEqual([
      ["https://docs.example.com/spec.json", true],
      ["http://localhost:6280/api/apis", false],
    ]);
  });

  it.each([
    ["http://10.0.0.7/spec.json", "10.0.0.7:80"],
    ["https://gitlab.internal/spec.json", "gitlab.internal:443"],
    ["https://gitlab.internal:443/spec.json", "GITLAB.internal:443"],
    ["https://[fd00::1]/spec.json", "[fd00::1]:443"],
  ])("admits %s when the project lists %s, its scheme's default port", async (url, entry) => {
    answerOnceAdmitted();

    expect(await fetchSpec(url, listing(entry))).toBe("spec");
    expect(requestSpec).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["http://10.0.0.7/spec.json", "10.0.0.7:443"],
    ["https://gitlab.internal/spec.json", "gitlab.internal:80"],
    ["http://10.0.0.7:8080/spec.json", "10.0.0.7:80"],
    ["http://10.0.0.7/spec.json", "10.0.0.7:8080"],
  ])("refuses %s when the project lists only %s", async (url, entry) => {
    answerOnceAdmitted();

    await expect(fetchSpec(url, listing(entry))).rejects.toMatchObject({
      code: "SPEC_HOST_PRIVATE",
    });
    expect(requestSpec).toHaveBeenCalledTimes(1);
  });

  it("admits a listed host on any port when the entry names none", async () => {
    answerOnceAdmitted();

    expect(
      await fetchSpec("https://gitlab.internal:8443/spec.json", listing("gitlab.internal")),
    ).toBe("spec");
  });
});
