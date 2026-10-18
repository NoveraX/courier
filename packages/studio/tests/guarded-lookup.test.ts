/**
 * The name lookup a specification fetch connects through: every address the
 * name resolves to is checked, and the connection goes only to an approved one.
 * The project is asked about the host only for an address it would otherwise
 * refuse, and never allows an address that means every interface.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LookupPolicy } from "../src/server/guarded-lookup";
import { SpecFetchError } from "../src/server/spec-fetch-error";
import { SpecHostsUnavailableError } from "../src/server/spec-hosts-unavailable-error";

const answers = vi.hoisted(() => ({ addresses: [] as Array<{ address: string; family: number }> }));

vi.mock("node:dns", () => ({
  promises: { lookup: async () => answers.addresses },
}));

const { guardedLookup } = await import("../src/server/guarded-lookup");

afterEach(() => {
  answers.addresses = [];
});

/* The project names the host when `allowed`; otherwise it refuses it as a loaded config would. */
function policyFor(allowed: boolean, loopback: boolean): LookupPolicy {
  return {
    loopback,
    admitPrivate: vi.fn(async (what: string) => {
      if (!allowed) throw SpecFetchError.privateHost(what);
    }),
  };
}

function lookupWith(
  policy: LookupPolicy,
  all = false,
): Promise<{ error: Error | null; address: unknown }> {
  return new Promise((resolve) => {
    guardedLookup(policy)("spec.example", { all }, (error, address) => resolve({ error, address }));
  });
}

function lookup(
  allowed: boolean,
  loopback = true,
  all = false,
): Promise<{ error: Error | null; address: unknown }> {
  return lookupWith(policyFor(allowed, loopback), all);
}

describe("guardedLookup", () => {
  it("connects to a public address", async () => {
    answers.addresses = [{ address: "93.184.215.14", family: 4 }];

    expect(await lookup(false)).toEqual({ error: null, address: "93.184.215.14" });
  });

  /* A fake-IP proxy answers every name with an address of 198.18.0.0/15 and
     takes it to the host the name was, for the developer who typed it. */
  it("connects to the address a fake-IP proxy answers the name with, asking the project nothing", async () => {
    answers.addresses = [{ address: "198.18.0.37", family: 4 }];
    const policy = policyFor(false, false);

    expect(await lookupWith(policy)).toEqual({ error: null, address: "198.18.0.37" });
    expect(policy.admitPrivate).not.toHaveBeenCalled();
  });

  it("refuses a name that resolves into a private network", async () => {
    answers.addresses = [{ address: "10.0.0.7", family: 4 }];

    const { error } = await lookup(false);

    expect(error).toMatchObject({ code: "SPEC_HOST_PRIVATE" });
    expect(error?.message).toContain("spec.example (10.0.0.7)");
  });

  it("refuses a name with any private address among public ones", async () => {
    answers.addresses = [
      { address: "93.184.215.14", family: 4 },
      { address: "::ffff:a9fe:a9fe", family: 6 },
    ];

    expect((await lookup(false)).error).toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("does not ask the project about a name whose addresses are all public or this machine", async () => {
    answers.addresses = [
      { address: "93.184.215.14", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    const policy = policyFor(false, true);

    expect(await lookupWith(policy)).toEqual({ error: null, address: "93.184.215.14" });
    expect(policy.admitPrivate).not.toHaveBeenCalled();
  });

  it("asks the project once for a name with several private addresses", async () => {
    answers.addresses = [
      { address: "10.0.0.7", family: 4 },
      { address: "fd00::7", family: 6 },
    ];
    const policy = policyFor(true, true);

    expect(await lookupWith(policy)).toEqual({ error: null, address: "10.0.0.7" });
    expect(policy.admitPrivate).toHaveBeenCalledTimes(1);
    expect(policy.admitPrivate).toHaveBeenCalledWith("spec.example (10.0.0.7)");
  });

  it.each(["0.0.0.0", "0.9.9.9", "::", "::ffff:0.0.0.0"])(
    "refuses a name that resolves to the unspecified address %s even when the project names it",
    async (address) => {
      answers.addresses = [{ address, family: address.includes(":") ? 6 : 4 }];

      const { error } = await lookup(true);

      expect(error).toMatchObject({ code: "SPEC_URL_INVALID" });
      expect(error?.message).toContain(`spec.example (${address})`);
    },
  );

  it("hands the connection the refusal the project gives while it cannot say", async () => {
    answers.addresses = [{ address: "10.0.0.7", family: 4 }];
    const unavailable = SpecHostsUnavailableError.reloading("spec.example (10.0.0.7)");

    const { error } = await lookupWith({
      loopback: true,
      admitPrivate: async () => Promise.reject(unavailable),
    });

    expect(error).toBe(unavailable);
  });

  it("connects to a private address the project names", async () => {
    answers.addresses = [{ address: "10.0.0.7", family: 4 }];

    expect(await lookup(true)).toEqual({ error: null, address: "10.0.0.7" });
  });

  it("connects to this machine", async () => {
    answers.addresses = [{ address: "127.0.0.1", family: 4 }];

    expect(await lookup(false)).toEqual({ error: null, address: "127.0.0.1" });
  });

  it("refuses this machine when the request was sent there by a server elsewhere", async () => {
    answers.addresses = [{ address: "127.0.0.1", family: 4 }];

    expect((await lookup(false, false)).error).toMatchObject({ code: "SPEC_HOST_PRIVATE" });
  });

  it("hands every approved address over when the connection asks for all of them", async () => {
    answers.addresses = [
      { address: "93.184.215.14", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ];

    expect(await lookup(false, true, true)).toEqual({ error: null, address: answers.addresses });
  });

  it("calls back once when the connection it hands the address to throws, and logs it", async () => {
    answers.addresses = [{ address: "93.184.215.14", family: 4 }];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;

    await new Promise<void>((resolve) => {
      guardedLookup(policyFor(false, true))("spec.example", {}, () => {
        calls += 1;
        setTimeout(resolve, 20);
        throw new Error("connect failed");
      });
    }).catch(() => undefined);

    expect(calls).toBe(1);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});
