/**
 * Handlers created with their own `sources` answer for those, whatever the
 * process-wide registry holds; handlers created without them keep reading
 * the registry at request time.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createWSHandler } from "../src/adapter/handle-ws";
import { courier, defineApi, getSourceName } from "../src/define";
import type { Sources } from "../src/define/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();

let upstream: Server;
let upstreamURL = "";

beforeAll(async () => {
  upstream = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => upstream.close(() => resolve())));

afterEach(() => {
  _resetSourcesForTests();
});

function source(prefix: string) {
  return defineApi({
    expose: true,
    baseURL: `${upstreamURL}/${prefix}`,
    endpoints: { ping: endpoint.get("") },
  });
}

function get(name: string): Request {
  return new Request(`http://localhost/api/request?_s=${name}&_m=ping`);
}

describe("createHandler with its own sources", () => {
  it("answers for them and not for the registry", async () => {
    registerSources({ registered: source("registered") });
    const handler = createHandler({ sources: { own: source("own") } });

    const own = await handler.handle(get("own"));
    const registered = await handler.handle(get("registered"));

    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ path: "/own/" });
    expect(registered.status).toBe(400);
  });

  it("answers without any registry at all", async () => {
    const handler = createHandler({ sources: { own: source("own") } });

    expect((await handler.handle(get("own"))).status).toBe(200);
  });

  it("names each source by its key, as registering does", () => {
    const own = source("own");

    createHandler({ sources: { own } });

    expect(getSourceName(own)).toBe("own");
  });

  it("refuses sources that are not an object of named sources", () => {
    expect(() => createHandler({ sources: [source("own")] as unknown as Sources })).toThrow(
      expect.objectContaining({ code: "SOURCES_NOT_A_RECORD" }),
    );
  });
});

describe("createHandler without sources", () => {
  it("reads the registry at request time", async () => {
    const handler = createHandler();
    registerSources({ later: source("later") });

    expect((await handler.handle(get("later"))).status).toBe(200);
  });
});

describe("createWSHandler with its own sources", () => {
  it("refuses sources that are not an object of named sources", () => {
    expect(() => createWSHandler({ sources: null as unknown as Sources })).toThrow(
      expect.objectContaining({ code: "SOURCES_NOT_A_RECORD" }),
    );
  });
});
