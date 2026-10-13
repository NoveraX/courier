/**
 * A caller without the project's token has its hosts' names looked up from
 * public DNS by a resolver of its request's own: every address, IPv4 and
 * IPv6, must be public; a name that resolves to no public address and one
 * that does not resolve at all are refused alike, naming the host alone;
 * and a lookup stops at once with its request.
 */
import { describe, expect, it, vi } from "vitest";

import type { LookupCallback, LookupPolicy } from "../src/server/guarded-lookup";
import { publicLookups } from "../src/server/public-lookups";
import type { NameResolver } from "../src/server/public-resolver";
import { SpecFetchError } from "../src/server/spec-fetch-error";

/* As a caller without the token is held: the public internet only, refused by the host's name. */
const PUBLIC_ONLY: LookupPolicy = {
  loopback: false,
  admitPrivate: (what) => Promise.reject(SpecFetchError.publicOnly(what, "public hosts only")),
};

function notFound(): Error {
  return Object.assign(new Error("queryA ENOTFOUND"), { code: "ENOTFOUND" });
}

/* A resolver answering each family as given: addresses, or a failure. */
function answering(v4: string[] | Error, v6: string[] | Error): NameResolver {
  const answer = (value: string[] | Error) =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  return { resolve4: () => answer(v4), resolve6: () => answer(v6), cancel: () => {} };
}

/* A resolver whose queries answer only once cancelled, as Node's does. */
function hanging(): NameResolver & { queries: number } {
  const pending: Array<(error: Error) => void> = [];
  const query = () =>
    new Promise<string[]>((_, reject) => {
      resolver.queries++;
      pending.push(reject);
    });
  const resolver = {
    queries: 0,
    resolve4: query,
    resolve6: query,
    cancel: () => {
      for (const reject of pending.splice(0)) {
        reject(Object.assign(new Error("cancelled"), { code: "ECANCELLED" }));
      }
    },
  };
  return resolver;
}

function lookUp(
  lookup: LookupCallback,
  all = true,
): Promise<{ error: Error | null; addresses: unknown }> {
  return new Promise((resolve) => {
    lookup("spec.example", { all }, (error, addresses) => resolve({ error, addresses }));
  });
}

describe("publicLookups", () => {
  it("connects to every public address of both families", async () => {
    const lookups = publicLookups(PUBLIC_ONLY, () =>
      answering(["93.184.215.14"], ["2606:2800:21f:cb07:6820:80da:af6b:8b2c"]),
    );

    expect(await lookUp(lookups.lookup)).toEqual({
      error: null,
      addresses: [
        { address: "93.184.215.14", family: 4 },
        { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
      ],
    });
  });

  it("connects to the first address when one is asked for", async () => {
    const lookups = publicLookups(PUBLIC_ONLY, () => answering(["93.184.215.14"], notFound()));

    expect(await lookUp(lookups.lookup, false)).toEqual({
      error: null,
      addresses: "93.184.215.14",
    });
  });

  it.each([
    ["a private IPv4 address", ["10.0.0.7"], notFound()],
    ["this machine", ["127.0.0.1"], ["::1"]],
    ["a private IPv6 address beside a public IPv4 one", ["93.184.215.14"], ["fd00::7"]],
    ["the address that means every interface", ["0.0.0.0"], notFound()],
  ])("refuses a name that resolves to %s, naming the host alone", async (_, v4, v6) => {
    const lookups = publicLookups(PUBLIC_ONLY, () => answering(v4, v6));

    const { error } = await lookUp(lookups.lookup);

    expect(error).toMatchObject({
      code: "SPEC_HOST_PRIVATE",
      message:
        "Blocked request to spec.example: public hosts only. Paste the specification, or give a public URL.",
    });
  });

  it("refuses a name that does not resolve as one that resolves to a private address", async () => {
    const missing = await lookUp(
      publicLookups(PUBLIC_ONLY, () => answering(notFound(), notFound())).lookup,
    );
    const inside = await lookUp(
      publicLookups(PUBLIC_ONLY, () => answering(["10.0.0.7"], notFound())).lookup,
    );

    expect(missing.error).toBeInstanceOf(SpecFetchError);
    expect(missing).toEqual(inside);
  });

  it("stops a lookup under way at once, without asking the policy", async () => {
    const resolver = hanging();
    const policy = { ...PUBLIC_ONLY, admitPrivate: vi.fn(PUBLIC_ONLY.admitPrivate) };
    const lookups = publicLookups(policy, () => resolver);
    const looking = lookUp(lookups.lookup);
    await vi.waitUntil(() => resolver.queries === 2);

    lookups.cancel();

    expect((await looking).error).toMatchObject({ code: "ECANCELLED" });
    expect(policy.admitPrivate).not.toHaveBeenCalled();
    await lookups.idle();
  });

  it("is idle only once every lookup under way has settled", async () => {
    const resolver = hanging();
    const lookups = publicLookups(PUBLIC_ONLY, () => resolver);
    void lookUp(lookups.lookup);
    await vi.waitUntil(() => resolver.queries === 2);
    let idle = false;
    void lookups.idle().then(() => {
      idle = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const beforeCancel = idle;
    lookups.cancel();
    await lookups.idle();

    expect(beforeCancel).toBe(false);
    expect(idle).toBe(true);
  });
});
