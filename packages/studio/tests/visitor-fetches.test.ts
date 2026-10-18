/**
 * What Studio fetches for a caller without the project's token: a few
 * fetches at once, a few megabytes of their bodies held between them, less
 * time each, and each one stopped the moment its caller goes away — so
 * callers that hang up, or hosts that answer slowly, cannot pile work and
 * memory up behind them. Their names are asked of this machine's name
 * servers directly, never of its resolver, and a lookup counts until it has
 * settled.
 */
import dns from "node:dns";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSpec } from "../src/server/fetch-spec";
import type { SpecHostAllowlist } from "../src/server/spec-host-allowlist";
import { StudioBusyError } from "../src/server/studio-busy-error";
import {
  VISITOR_FETCH_BYTES,
  VISITOR_FETCH_DEADLINE_MS,
  VISITOR_FETCHES,
  visitorFetchBytes,
} from "../src/server/visitor-fetches";

/* The test's hosts listen on this machine; here they stand for hosts on the public internet. */
vi.mock("../src/server/address-kind-here", () => ({ addressKindHere: () => "public" }));

/* The name servers as the tests answer them: a name of a test host, or a query that never answers. */
const names = vi.hoisted(() => ({
  resolve4: (_hostname: string): Promise<string[]> => Promise.resolve(["127.0.0.1"]),
  cancel: (): void => {},
}));

vi.mock("../src/server/public-resolver", () => ({
  publicResolver: () => ({
    resolve4: (hostname: string) => names.resolve4(hostname),
    resolve6: () => Promise.reject(Object.assign(new Error("no AAAA"), { code: "ENODATA" })),
    cancel: () => names.cancel(),
  }),
}));

const NOTHING_LISTED: SpecHostAllowlist = async () => ({ state: "listed", hosts: [] });
const MB = 1024 * 1024;

const servers: Server[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  names.resolve4 = () => Promise.resolve(["127.0.0.1"]);
  names.cancel = () => {};
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

/* A host that answers with `bytes` of a body and then stalls, never ending it. */
async function stalling(
  bytes = 1,
): Promise<{ url: string; open: () => number; sent: Promise<void> }> {
  const sockets = new Set<Socket>();
  let sentAll!: () => void;
  const sent = new Promise<void>((resolve) => (sentAll = resolve));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write(Buffer.alloc(bytes, 0x20), () => sentAll());
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/spec.json`, open: () => sockets.size, sent };
}

/* A host that answers every request with `body`. */
async function answering(body: string): Promise<{ url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/spec.json` };
}

function visitorFetch(url: string, signal: AbortSignal): Promise<unknown> {
  return fetchSpec(url, NOTHING_LISTED, { reach: "public", signal }).catch(
    (error: unknown) => error,
  );
}

/* Wait for what a test needs to have happened, and fail saying so when it does not. */
async function until(check: () => boolean, what = "the condition"): Promise<void> {
  for (let tries = 0; !check(); tries++) {
    if (tries >= 200) throw new Error(`Waited 2 s for ${what}, in vain.`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/* Lookups that never answer and that cancelling does not end, as this machine's resolver's do. */
function stuckLookups(): { asked: () => number; answer: () => void } {
  const waiting: Array<(addresses: string[]) => void> = [];
  names.resolve4 = () => new Promise((resolve) => waiting.push(resolve));
  return {
    asked: () => waiting.length,
    answer: () => {
      for (const resolve of waiting.splice(0)) resolve(["127.0.0.1"]);
    },
  };
}

describe("the fetches Studio runs for callers without the token", () => {
  it(`run ${VISITOR_FETCHES} at once, and one more is refused as Studio being busy`, async () => {
    const host = await stalling();
    const callers = Array.from({ length: VISITOR_FETCHES }, () => new AbortController());
    const running = callers.map((caller) => visitorFetch(host.url, caller.signal));
    await until(() => host.open() === VISITOR_FETCHES);

    const one = await visitorFetch(host.url, new AbortController().signal);
    for (const caller of callers) caller.abort();

    expect(one).toBeInstanceOf(StudioBusyError);
    expect(await Promise.all(running)).toEqual(
      callers.map(() => expect.objectContaining({ code: "SPEC_ABORTED" })),
    );
  });

  it("stop once their caller goes away, closing the host's connection", async () => {
    const host = await stalling();
    const caller = new AbortController();
    const fetching = visitorFetch(host.url, caller.signal);
    await until(() => host.open() === 1);

    caller.abort();

    expect(await fetching).toMatchObject({ code: "SPEC_ABORTED" });
    await until(() => host.open() === 0);
    expect(host.open()).toBe(0);
  });

  it("free their places once they have ended, for the next callers", async () => {
    const host = await stalling();
    const callers = Array.from({ length: VISITOR_FETCHES }, () => new AbortController());
    const running = callers.map((caller) => visitorFetch(host.url, caller.signal));
    await until(() => host.open() === VISITOR_FETCHES);
    for (const caller of callers) caller.abort();
    await Promise.all(running);

    const next = new AbortController();
    const admitted = visitorFetch(host.url, next.signal);
    await until(() => host.open() === 1);
    next.abort();

    expect(await admitted).toMatchObject({ code: "SPEC_ABORTED" });
  });

  it(`hold no more than ${VISITOR_FETCH_BYTES / MB} MB of their bodies between them`, async () => {
    const share = 12 * MB;
    const callers = [new AbortController(), new AbortController(), new AbortController()];
    const running: Array<Promise<unknown>> = [];
    for (const caller of callers.slice(0, 2)) {
      const host = await stalling(share);
      running.push(visitorFetch(host.url, caller.signal));
      await host.sent;
      await until(() => visitorFetchBytes.used >= share * running.length);
    }

    const last = await stalling(share);
    const third = await visitorFetch(last.url, callers[2]?.signal ?? new AbortController().signal);
    for (const caller of callers) caller.abort();
    await Promise.all(running);

    await until(() => visitorFetchBytes.used === 0);

    expect(third).toBeInstanceOf(StudioBusyError);
    expect(visitorFetchBytes.used).toBe(0);
  });

  it(`give up on a host that has not sent the whole body in ${VISITOR_FETCH_DEADLINE_MS / 1000} s`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = await stalling();
    const fetching = visitorFetch(host.url, new AbortController().signal);
    await vi.waitUntil(() => host.open() === 1, { timeout: 2_000 });

    await vi.advanceTimersByTimeAsync(VISITOR_FETCH_DEADLINE_MS);

    expect(await fetching).toMatchObject({ code: "SPEC_TIMEOUT" });
  });

  it("ask a name of the name servers directly, never of this machine's resolver", async () => {
    const host = await answering("{}");
    const lookup = vi.spyOn(dns, "lookup");
    const promisedLookup = vi.spyOn(dns.promises, "lookup");

    const text = await fetchSpec(host.url.replace("127.0.0.1", "spec.test"), NOTHING_LISTED, {
      reach: "public",
    });

    expect(text).toBe("{}");
    expect(lookup).not.toHaveBeenCalled();
    expect(promisedLookup).not.toHaveBeenCalled();
  });

  it("count a lookup that never answers until it has settled, however often its caller hangs up", async () => {
    const stuck = stuckLookups();
    const callers = Array.from({ length: VISITOR_FETCHES }, () => new AbortController());
    const running = callers.map((caller, n) =>
      visitorFetch(`http://stuck-${n}.test/openapi.json`, caller.signal),
    );
    await until(() => stuck.asked() === VISITOR_FETCHES, "every lookup to be asked");
    for (const caller of callers) caller.abort();

    const turnedAway = await visitorFetch(
      "http://next.test/openapi.json",
      new AbortController().signal,
    );
    stuck.answer();
    const ended = await Promise.all(running);

    expect(turnedAway).toBeInstanceOf(StudioBusyError);
    expect(ended).toEqual(callers.map(() => expect.objectContaining({ code: "SPEC_ABORTED" })));
  });

  it("never hold up a lookup of the developer's own while theirs never answer", async () => {
    const stuck = stuckLookups();
    const callers = Array.from({ length: VISITOR_FETCHES }, () => new AbortController());
    const running = callers.map((caller, n) =>
      visitorFetch(`http://stuck-${n}.test/openapi.json`, caller.signal),
    );
    await until(() => stuck.asked() === VISITOR_FETCHES, "every lookup to be asked");
    const host = await answering("{}");
    const started = Date.now();

    const text = await fetchSpec(host.url.replace("127.0.0.1", "localhost"), NOTHING_LISTED);
    const took = Date.now() - started;
    for (const caller of callers) caller.abort();
    stuck.answer();
    await Promise.all(running);

    expect(text).toBe("{}");
    expect(took).toBeLessThan(2_000);
  });
});
