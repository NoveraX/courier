/**
 * What the Studio UI learns about the calls an attached application makes.
 *
 * A real Studio server runs here with a UI socket connected to it. This
 * process is the application: it serves the proxy for its sources, calls it
 * the way a browser does, and calls the upstream directly as a server does,
 * with its runtime attached to Studio. Every assertion reads the events the UI
 * socket received.
 */
import { createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { type LiveApp, startLiveApp, startUpstream } from "./helpers/live-app";
import { type LiveStudio, startLiveStudio, until } from "./helpers/live-studio";

const { endpoint } = courier();
let studio: LiveStudio;
let app: LiveApp;
let upstream: Awaited<ReturnType<typeof startUpstream>>;

function defineSources(baseURL: string) {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<Array<{ id: number }>>(),
    },
  });
  return { api: defineApi({ baseURL, groups: { users } }) };
}

type Api = ReturnType<typeof defineSources>["api"];

beforeAll(async () => {
  upstream = await startUpstream({ "GET /users": { status: 200, body: [{ id: 1 }] } });
  studio = await startLiveStudio();
  app = await startLiveApp(studio.url, "app", defineSources(upstream.url));
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
