/**
 * What a running Studio sends the UI, put through the guards the UI applies
 * before it shows anything. Each side has tests of its own — the server's
 * payloads by shape, the guards against fixtures — and this one feeds one to
 * the other, so a field renamed on one side cannot reach the other as a
 * payload the UI drops without a word.
 */
import { createCaller, createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { announceHosting } from "@noverax/courier-studio-core/runtime";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { isBindingSnapshot } from "../ui/src/socket/binding-guards";
import { isConfigStatusPayload } from "../ui/src/socket/config-status-guard";
import { isStudioEvent } from "../ui/src/socket/event-guards";
import { isScannedSource, isSourceSummary } from "../ui/src/socket/source-list-guards";
import { type LiveApp, startLiveApp, startUpstream } from "./helpers/live-app";
import { type LiveStudio, startLiveStudio, until } from "./helpers/live-studio";

const { endpoint } = courier();

function defineSources(baseURL: string) {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      list: endpoint.get("").response<Array<{ id: number }>>(),
      create: endpoint.post("").variables(z.object({ name: z.string().min(2) })),
    },
  });
  const faults = defineGroup({
    prefix: "faults",
    endpoints: {
      missing: endpoint.get("missing").response<unknown>(),
      badShape: endpoint.get("bad-shape").response(z.object({ id: z.number() })),
    },
  });
  /* A binding row exists for a source that declares where its proxy is. */
  return {
    api: defineApi({
      expose: true,
      baseURL,
      proxyPath: { http: "/api/request" },
      groups: { users, faults },
    }),
  };
}

const CONFIG = `
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
const { endpoint } = courier();
const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });
export default {
  sources: { api: defineApi({ expose: true, baseURL: "http://127.0.0.1:9", proxyPath: { http: "/api/request" }, groups: { users } }) },
};
`;

let studio: LiveStudio;
let app: LiveApp;
let ui: Socket;
let upstream: Awaited<ReturnType<typeof startUpstream>>;
const frames = new Map<string, unknown[]>();

function framesOf(name: string): unknown[] {
  return frames.get(name) ?? [];
}

beforeAll(async () => {
  upstream = await startUpstream({
    "GET /users": { status: 200, body: [{ id: 1 }] },
    "POST /users": { status: 201, body: { id: 2 } },
    "GET /faults/missing": { status: 404, body: { message: "not here" } },
    "GET /faults/bad-shape": { status: 200, body: { id: "one" } },
  });
  studio = await startLiveStudio({ "courier.config.ts": CONFIG });
  /* A UI of its own, listening before it connects, receives what Studio sends on connecting. */
  ui = connect(`${studio.url}/ui`, { transports: ["websocket"], autoConnect: false });
  for (const name of ["binding:snapshot", "config:status", "registry:updated", "scan:sources"]) {
    ui.on(name, (payload: unknown) => frames.set(name, [...framesOf(name), payload]));
  }
  ui.connect();
  await until(() => framesOf("config:status").length > 0, "the configuration status");
  const sources = defineSources(upstream.url);
  app = await startLiveApp(studio.url, "app", sources);
  await until(() => getRuntimeEntry("app") !== undefined, "the runtime to connect");
  announceHosting({ transports: ["http"], sources: Object.values(sources) });

  const proxy = createProxyCaller(routesOf(sources.api, "api"), {
    proxyPath: { http: app.proxyUrl },
  });
  const direct = createCaller(sources.api);
  await proxy.users.list();
  await proxy.users.create({ name: "Ada" });
  await proxy.users.create({ name: "A" }).catch(() => undefined);
  await direct.faults.missing().catch(() => undefined);
  await direct.faults.badShape().catch(() => undefined);
  await until(
    () =>
      studio.events.filter(
        (event) => event.type === "request:end" || event.type === "request:error",
      ).length >= 5,
    "every call to finish",
  );
  await until(
    () =>
      framesOf("binding:snapshot").some((s) => JSON.stringify(s).includes('"sourceName":"api"')),
    "the hosted source's row in a binding snapshot",
  );
});

afterAll(async () => {
  ui.disconnect();
  await app.close();
  await studio.close();
  await upstream.close();
});

describe("what Studio sends the UI", () => {
  it("is an event the UI records, for every event of every kind of call", () => {
    const kinds = new Set(studio.events.map((event) => event.type));

    expect(studio.events.filter((event) => !isStudioEvent(event))).toEqual([]);
    expect([...kinds]).toEqual(
      expect.arrayContaining(["request:start", "request:end", "request:error"]),
    );
  });

  it("is a binding snapshot the UI shows, naming the attached application's source", () => {
    const snapshots = framesOf("binding:snapshot");

    expect(snapshots.filter((snapshot) => !isBindingSnapshot(snapshot))).toEqual([]);
    expect(JSON.stringify(snapshots.at(-1))).toContain('"sourceName":"api"');
  });

  it("is a configuration status the UI shows", () => {
    const statuses = framesOf("config:status");

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.filter((status) => !isConfigStatusPayload(status))).toEqual([]);
  });

  it("is a list of sources whose every entry the UI shows", () => {
    const entries = (name: string): unknown[] =>
      framesOf(name).flatMap((frame) =>
        typeof frame === "object" &&
        frame !== null &&
        "sources" in frame &&
        Array.isArray(frame.sources)
          ? frame.sources
          : [frame],
      );

    expect(entries("registry:updated").filter((entry) => !isSourceSummary(entry))).toEqual([]);
    expect(entries("scan:sources").filter((entry) => !isScannedSource(entry))).toEqual([]);
  });
});
