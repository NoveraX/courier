/**
 * One request for a specification runs on one clock, whatever the host is
 * written as: the wait for the project to admit a private host counts
 * against it, and time that runs out during that wait reports that Studio
 * could not tell yet, never a host that did not answer. A host admitted too
 * late is never connected to.
 */
import type * as Dns from "node:dns";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LookupPolicy } from "../src/server/guarded-lookup";
import { SpecFetchError } from "../src/server/spec-fetch-error";

/* Names this test resolves itself, each after its delay; every other name resolves as usual. */
const RESOLVED = vi.hoisted(
  () => new Map<string, { addresses: Array<{ address: string; family: number }>; delayMs: number }>(),
);

vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof Dns>();
  const lookup = async (hostname: string, options: Dns.LookupAllOptions) => {
    const answer = RESOLVED.get(hostname);
    if (answer === undefined) return actual.promises.lookup(hostname, options);
    await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
    return answer.addresses;
  };
  return { ...actual, promises: { ...actual.promises, lookup } };
});

const { requestSpec } = await import("../src/server/spec-request");

const servers: Server[] = [];

afterEach(async () => {
  RESOLVED.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

/* A spec server on this machine that counts the connections it is sent. */
async function serveCounting(): Promise<{ port: number; connections: () => number }> {
  let connections = 0;
  const server = createServer((_req, res) => res.end("spec"));
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the spec server has no port");
  return { port: address.port, connections: () => connections };
}

/* A project that takes `delayMs` to decide, then admits the host or refuses it as a loaded config would. */
function deciding(delayMs: number, admits: boolean, loopback = true) {
  const decided: Array<Promise<void>> = [];
  const policy: LookupPolicy = {
    loopback,
    admitPrivate: (what) => {
      const decision = new Promise<void>((resolve, reject) =>
        setTimeout(() => (admits ? resolve() : reject(SpecFetchError.privateHost(what))), delayMs),
      );
      decided.push(decision.catch(() => undefined));
      return decision;
    },
  };
  return { policy, decided };
}

async function elapsed<TResult>(run: () => Promise<TResult>): Promise<{ result: PromiseSettledResult<TResult>; ms: number }> {
  const started = Date.now();
  const [result] = await Promise.allSettled([run()]);
  return { result, ms: Date.now() - started };
}

describe("requestSpec", () => {
  it.each([
    ["a name", "http://lan.spec.test/spec.json", "lan.spec.test (10.0.0.7)"],
    ["a written-out address", "http://10.0.0.7/spec.json", "10.0.0.7"],
  ])(
    "reports time that runs out while the project decides on %s as Studio not able to tell yet",
    async (_written, url, what) => {
      RESOLVED.set("lan.spec.test", { addresses: [{ address: "10.0.0.7", family: 4 }], delayMs: 0 });
      const { policy } = deciding(1_000, false);

      const { result, ms } = await elapsed(() => requestSpec(new URL(url), policy, 200));

      expect(result).toMatchObject({
        status: "rejected",
        reason: {
          code: "CONFIG_RELOADING",
          httpStatus: 503,
          message: expect.stringContaining(`Blocked request to private address: ${what}.`),
        },
      });
      expect(ms).toBeLessThan(1_000);
    },
  );

  it.each([
    ["a name", "loop.spec.test"],
    ["a written-out address", "127.0.0.1"],
  ])("never connects to %s the project admits after the time ran out", async (_written, host) => {
    RESOLVED.set("loop.spec.test", { addresses: [{ address: "127.0.0.1", family: 4 }], delayMs: 0 });
    const server = await serveCounting();
    /* This machine, reached by a request a server elsewhere sent here, needs the project's word. */
    const { policy, decided } = deciding(300, true, false);

    const { result } = await elapsed(() =>
      requestSpec(new URL(`http://${host}:${server.port}/spec.json`), policy, 100),
    );
    await Promise.all(decided);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(decided).toHaveLength(1);
    expect(result).toMatchObject({ status: "rejected", reason: { code: "CONFIG_RELOADING" } });
    expect(server.connections()).toBe(0);
  });

  it.each([
    ["a name", "loop.spec.test"],
    ["a written-out address", "127.0.0.1"],
  ])("fetches %s the project admits in time", async (_written, host) => {
    RESOLVED.set("loop.spec.test", { addresses: [{ address: "127.0.0.1", family: 4 }], delayMs: 0 });
    const server = await serveCounting();
    const { policy } = deciding(50, true, false);

    const answer = await requestSpec(new URL(`http://${host}:${server.port}/spec.json`), policy, 2_000);

    expect(answer).toMatchObject({ kind: "body", text: "spec" });
  });

  it("reports a name that does not resolve in time as a host that did not answer", async () => {
    RESOLVED.set("slow.spec.test", { addresses: [{ address: "10.0.0.7", family: 4 }], delayMs: 1_000 });
    const { policy } = deciding(0, true);

    const { result, ms } = await elapsed(() => requestSpec(new URL("http://slow.spec.test/spec.json"), policy, 150));

    expect(result).toMatchObject({ status: "rejected", reason: { code: "SPEC_TIMEOUT" } });
    expect(ms).toBeLessThan(1_000);
  });
});
