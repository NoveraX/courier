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
  return { api: defineApi({ baseURL, groups: { users } }) };
}

type Api = ReturnType<typeof defineSources>["api"];

beforeAll(async () => {
  upstream = await startUpstream({ "GET /users": { status: 200, body: [{ id: 1 }] } });
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
