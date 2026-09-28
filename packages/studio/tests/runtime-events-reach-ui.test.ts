/**
 * What the Studio UI learns about the calls an attached application makes.
 *
 * A real Studio server runs here with a UI socket connected to it. This
 * process is the application: it serves the proxy for its sources, calls it
 * the way a browser does, and calls the upstream directly as a server does,
 * with its runtime attached to Studio. Every assertion reads the events the UI
 * socket received.
 */
import { createCaller, createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
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

function defineSources(baseURL: string) {
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
  return { api: defineApi({ baseURL, groups: { users, faults } }) };
}

type Api = ReturnType<typeof defineSources>["api"];

beforeAll(async () => {
  upstream = await startUpstream({
    "GET /users": { status: 200, body: [{ id: 1 }] },
    "GET /faults/missing": { status: 404, body: { message: "not here" }, headers: { "x-upstream": "yes" } },
    "GET /faults/bad-shape": { status: 200, body: { id: "one" } },
    "GET /faults/slow": { status: 200, body: {}, delayMs: 1_000 },
  });
  studio = await startLiveStudio();
  sources = defineSources(upstream.url);
  app = await startLiveApp(studio.url, "app", sources);
  await until(() => getRuntimeEntry("app") !== undefined, "the runtime to connect");
}, 30_000);

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
    const client = createProxyCaller<Api>("api", { proxyPath: { http: app.proxyUrl } });
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
    const started = () => eventsOf("request:start").slice(before).find((e) => e.method === method);
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
    const client = createProxyCaller<Api>("api", { proxyPath: { http: app.proxyUrl } });

    const refused = await failureOf("badShape", () => client.faults.badShape());
    const timedOut = await failureOf("slow", () => client.faults.slow());

    expect(refused.status).toBe(422);
    expect(timedOut.status).toBe(504);
    expect((timedOut.error as { type: string }).type).toBe("timeout");
  });

  it("says a direct call timed out", async () => {
    const failure = await failureOf("slow", () => createCaller(sources.api).faults.slow());

    expect((failure.error as { type: string }).type).toBe("timeout");
    expect((failure.timing as { total: number }).total).toBeGreaterThanOrEqual(90);
  });
});
