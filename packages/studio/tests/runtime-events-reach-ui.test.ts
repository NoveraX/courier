/**
 * What the Studio UI learns about the calls an attached application makes.
 *
 * A real Studio server runs here with a UI socket connected to it. This
 * process is the application: it serves the proxy for its sources, calls it
 * the way a browser does, and calls the upstream directly as a server does,
 * with its runtime attached to Studio. Every assertion reads the events the UI
 * socket received.
 */

import { createServer as createTcpServer } from "node:net";
import { createCaller, createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { type LiveApp, startLiveApp, startUpstream } from "./helpers/live-app";
import { type LiveStudio, startLiveStudio, until } from "./helpers/live-studio";

const { endpoint } = courier();
let studio: LiveStudio;
let app: LiveApp;
let upstream: Awaited<ReturnType<typeof startUpstream>>;
let sources: ReturnType<typeof defineSources>;

/* A port nothing listens on: taken, then let go. A low one such as 9 is refused by fetch itself. */
async function closedPort(): Promise<number> {
  const server = createTcpServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return typeof address === "object" && address ? address.port : 0;
}

function defineSources(baseURL: string, closed: number) {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<Array<{ id: number }>>(),
      create: endpoint.post("").variables(z.object({ name: z.string().min(2) })),
      remove: endpoint.del(":id").variables<{ id: number }>(),
    },
  });
  const faults = defineGroup({
    prefix: "faults",
    endpoints: {
      missing: endpoint.get("missing").response<unknown>(),
      badShape: endpoint.get("bad-shape").response(z.object({ id: z.number() })),
      slow: endpoint.get("slow").timeout(100).response<unknown>(),
    },
  });
  const gone = defineApi({
    expose: true,
    baseURL: `http://127.0.0.1:${closed}`,
    endpoints: { ping: endpoint.get("ping").response<unknown>() },
  });
  /* fetch refuses a URL with a user and password, and says so naming the URL. */
  const signed = defineApi({
    expose: true,
    baseURL: `http://user:pa55@127.0.0.1:${closed}/v1?token=s3cret`,
    endpoints: { whoami: endpoint.get("whoami").response<unknown>() },
  });
  /* A password a quote and a space split, which fetch quotes as it was given. */
  const split = defineApi({
    expose: true,
    baseURL: `http://user:pa55w0rd' pa55w0rd@127.0.0.1:${closed}/v1`,
    endpoints: { whoami: endpoint.get("whoami").response<unknown>() },
  });
  return {
    api: defineApi({ expose: true, baseURL, groups: { users, faults } }),
    gone,
    signed,
    split,
  };
}

beforeAll(async () => {
  upstream = await startUpstream({
    "GET /users": { status: 200, body: [{ id: 1 }] },
    "GET /faults/missing": {
      status: 404,
      body: { message: "not here" },
      headers: { "x-upstream": "yes" },
    },
    "GET /faults/bad-shape": { status: 200, body: { id: "one" } },
    "GET /faults/slow": { status: 200, body: {}, delayMs: 1_000 },
  });
  studio = await startLiveStudio();
  sources = defineSources(upstream.url, await closedPort());
  app = await startLiveApp(studio.url, "app", sources);
  await until(() => getRuntimeEntry("app") !== undefined, "the runtime to connect");
});

afterAll(async () => {
  await app.close();
  await studio.close();
  await upstream.close();
});

function eventsOf(type: string): Array<Record<string, unknown>> {
  return studio.events.filter((event) => event.type === type);
}

describe("a proxy call", () => {
  it("reaches the UI with the timing its caller measured", async () => {
    const client = createProxyCaller(routesOf(sources.api, "api"), {
      proxyPath: { http: app.proxyUrl },
    });
    await client.users.list();
    await until(() => eventsOf("proxy:client-timing").length > 0, "the client timing");

    const [start] = eventsOf("request:start");
    const [timing] = eventsOf("proxy:client-timing");
    expect(timing?.requestId).toBe(start?.id);
    expect(timing?.totalRoundTrip).toBeGreaterThan(0);
  });
});

describe("a call that fails before it is sent", () => {
  it("reaches the UI with its verb and as a mutation", async () => {
    const before = eventsOf("request:start").length;
    const client = createCaller(sources.api);
    await expect(client.users.create({ name: "x" })).rejects.toThrow(/Validation failed/);
    await expect(client.users.remove({ id: 1 })).rejects.toThrow();
    await until(() => eventsOf("request:start").length >= before + 2, "both calls");

    const started = eventsOf("request:start").slice(before);
    expect(started.map((e) => [e.method, e.httpMethod, e.endpointType])).toEqual([
      ["create", "POST", "mutation"],
      ["remove", "DELETE", "mutation"],
    ]);
  });
});

describe("a call that fails", () => {
  /** The request:error of the call to `method` that `call` makes. */
  async function failureOf(
    method: string,
    call: () => Promise<unknown>,
  ): Promise<Record<string, unknown>> {
    const before = eventsOf("request:start").length;
    await call().catch(() => undefined);
    const started = () =>
      eventsOf("request:start")
        .slice(before)
        .find((e) => e.method === method);
    await until(() => started() !== undefined, "the call");
    const failure = () => eventsOf("request:error").find((e) => e.requestId === started()?.id);
    await until(() => failure() !== undefined, "the failure");
    return failure() ?? {};
  }

  it("reaches the UI with the upstream's status, headers and body, and how long it took", async () => {
    const failure = await failureOf("missing", () => createCaller(sources.api).faults.missing());

    expect(failure.status).toBe(404);
    expect(failure.data).toEqual({ message: "not here" });
    expect(failure.headers).toMatchObject({ "x-upstream": "yes" });
    expect((failure.timing as { total: number }).total).toBeGreaterThan(0);
  });

  it("reaches the UI, over the proxy, with the status its caller received", async () => {
    const client = createProxyCaller(routesOf(sources.api, "api"), {
      proxyPath: { http: app.proxyUrl },
    });

    const refused = await failureOf("badShape", () => client.faults.badShape());
    const timedOut = await failureOf("slow", () => client.faults.slow());

    expect(refused.status).toBe(422);
    expect(timedOut.status).toBe(504);
    expect((timedOut.error as { type: string }).type).toBe("timeout");
  });

  it("reaches the UI with why no answer came", async () => {
    const failure = await failureOf("ping", () => createCaller(sources.gone).ping());

    expect(failure.error).toMatchObject({
      type: "network",
      cause: { code: "ECONNREFUSED", message: expect.stringContaining("ECONNREFUSED") },
    });
  });

  it("reaches the UI naming no user, password or token of the URL fetch refused", async () => {
    const failure = await failureOf("whoami", () => createCaller(sources.signed).whoami());

    const cause = (failure.error as { cause?: { message: string } }).cause;
    expect(cause?.message).toMatch(/includes credentials: http:\/\/127\.0\.0\.1:\d+$/);
    expect(JSON.stringify(failure)).not.toMatch(/s3cret|pa55/);
  });

  it("reaches the UI naming no part of a password a quote or a space splits", async () => {
    const failure = await failureOf("whoami", () => createCaller(sources.split).whoami());

    const cause = (failure.error as { cause?: { message: string } }).cause;
    expect(cause?.message).toMatch(/includes credentials: http:\/\/127\.0\.0\.1:\d+$/);
    expect(JSON.stringify(failure)).not.toMatch(/pa55/);
  });

  it("reaches the UI, over the proxy, with why the upstream gave no answer", async () => {
    const client = createProxyCaller(routesOf(sources.gone, "gone"), {
      proxyPath: { http: app.proxyUrl },
    });

    const failure = await failureOf("ping", () => client.ping());

    expect(failure.error).toMatchObject({ cause: { code: "ECONNREFUSED" } });
  });

  it("says a direct call timed out", async () => {
    const failure = await failureOf("slow", () => createCaller(sources.api).faults.slow());

    expect((failure.error as { type: string }).type).toBe("timeout");
    expect((failure.timing as { total: number }).total).toBeGreaterThanOrEqual(90);
  });
});
