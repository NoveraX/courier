/**
 * Which sources a server answers for: its own, held by its handlers rather
 * than read back from the process-wide registry, so a second server — or
 * the host's own `registerSources` — never replaces what the first one
 * serves.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { getSources, registerSources } from "@noverax/courier";
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createCourierServer } from "../src/create-server";
import type { CourierServer } from "../src/types";

const { endpoint, channel } = courier();

let upstream: Server;
let upstreamURL = "";
const running: CourierServer[] = [];

beforeAll(async () => {
  upstream = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  return () => new Promise<void>((resolve) => upstream.close(() => resolve()));
});

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.stop()));
});

function source(prefix: string) {
  return defineApi({
    expose: true,
    baseURL: `${upstreamURL}/${prefix}`,
    endpoints: { ping: endpoint.get("") },
  });
}

async function serve(sources: Sources): Promise<string> {
  const server = createCourierServer({ sources, port: 0, host: "127.0.0.1", signals: false });
  running.push(server);
  return server.ready;
}

/** The type of the first message a subscription to `topic` gets back. */
async function subscribeReply(url: string, topic: string): Promise<string> {
  const client = new WebSocket(url.replace("http", "ws"));
  await new Promise((resolve) => client.once("open", resolve));
  const reply = new Promise<string>((resolve) => {
    client.on("message", (data) => resolve((JSON.parse(String(data)) as { type: string }).type));
  });
  client.send(JSON.stringify({ type: "subscribe", id: topic, topic }));
  const type = await reply;
  client.terminate();
  return type;
}

async function call(url: string, name: string): Promise<number> {
  const res = await fetch(`${url}/api/request?_s=${name}&_m=ping`);
  await res.body?.cancel();
  return res.status;
}

describe("a server's sources", () => {
  it("stay its own when a second server starts in the same process", async () => {
    const first = await serve({ api: source("api") });
    await serve({ other: source("other") });

    expect(await call(first, "api")).toBe(200);
    expect(await call(first, "other")).toBe(400);
  });

  it("stay its own when the host registers sources later", async () => {
    const url = await serve({ api: source("api") });

    registerSources({ host: source("host") });

    expect(await call(url, "api")).toBe(200);
    expect(await call(url, "host")).toBe(400);
  });

  it("stay its own on the WebSocket when the host registers sources later", async () => {
    const feed = channel.response<string>().implement(async function* () {
      yield "hello";
      await new Promise(() => {});
    });
    const url = await serve({
      live: defineApi({ expose: true, baseURL: upstreamURL, endpoints: { feed } }),
    });

    registerSources({ host: source("host") });

    expect(await subscribeReply(url, "live.feed")).not.toBe("complete");
    expect(await subscribeReply(url, "host.ping")).toBe("complete");
  });

  it("must be given, not taken from whatever the process registered", () => {
    registerSources({ host: source("host") });

    expect(() =>
      createCourierServer({ sources: undefined as never, port: 0, signals: false }),
    ).toThrow(expect.objectContaining({ code: "SOURCES_NOT_A_RECORD" }));
  });

  it("must be an object of named sources", () => {
    expect(() =>
      createCourierServer({ sources: [source("api")] as never, port: 0, signals: false }),
    ).toThrow(expect.objectContaining({ code: "SOURCES_NOT_A_RECORD" }));
  });

  it("leave the host's registered sources as they were", async () => {
    const hosts = { host: source("host") };
    registerSources(hosts);

    await serve({ api: source("api") });

    expect(getSources()).toBe(hosts);
  });
});
