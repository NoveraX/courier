/**
 * The Studio row an upload is shown in.
 *
 * A caller measures its upload's progress before the proxy has seen the call,
 * so the proxy adopts the id the caller sends, and Studio shows the progress
 * on the request's own row; a direct call reports its progress under the id
 * its `request:start` carries.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { sendWebResponse, toWebRequest } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { studioHooks } from "../src/studio";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;
let server: Server;
let proxyUrl = "";

const starts: string[] = [];
const progress: Array<{
  requestId: string;
  source?: string | undefined;
  group?: string | undefined;
  method?: string | undefined;
  percentage: number;
}> = [];
const completed: string[] = [];

function api() {
  return defineApi({
    expose: true,
    name: "api",
    baseURL: upstream.url,
    endpoints: { upload: endpoint.post("upload").variables<FormData>() },
  });
}

function form(): FormData {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(256 * 1024)]), "photo.bin");
  return body;
}

beforeEach(async () => {
  upstream = await startUpstream(echo);
  registerSources({ api: api() });
  const handler = createHandler();
  server = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/request`;

  studioHooks.onRequestStart = (e) => starts.push(e.id);
  studioHooks.onUploadProgress = (e) => progress.push(e);
  studioHooks.onUploadComplete = (e) => completed.push(e.requestId);
});

afterEach(async () => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onUploadProgress = undefined;
  studioHooks.onUploadComplete = undefined;
  starts.length = 0;
  progress.length = 0;
  completed.length = 0;
  _resetSourcesForTests();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await upstream.close();
});

describe("an upload through the proxy", () => {
  it("is reported under the id the proxy shows the call by", async () => {
    const client = createProxyCaller(routesOf(api(), "api"), { proxyPath: { http: proxyUrl } });

    await client.with({ onUploadProgress: () => {} }).upload(form());

    const [id] = starts;
    expect(id).toMatch(/^up_/);
    expect(new Set(progress.map((p) => p.requestId))).toEqual(new Set([id]));
    expect(progress.at(-1)).toMatchObject({ source: "api", method: "upload", percentage: 100 });
    expect(completed).toEqual([id]);
  });

  it("keeps the id the caller named, as Studio's Playground names its runs", async () => {
    const client = createProxyCaller(routesOf(api(), "api"), {
      proxyPath: { http: proxyUrl },
      headers: { "x-courier-rid": "pg_run-1234" },
    });

    await client.with({ onUploadProgress: () => {} }).upload(form());

    expect(new Set(starts)).toEqual(new Set(["pg_run-1234"]));
    expect(new Set(progress.map((p) => p.requestId))).toEqual(new Set(["pg_run-1234"]));
  });

  it("leaves the proxy to name the call when the caller does not watch its upload", async () => {
    const client = createProxyCaller(routesOf(api(), "api"), { proxyPath: { http: proxyUrl } });

    await client.upload(form());

    expect(starts).toHaveLength(2);
    expect(new Set(starts).size).toBe(1);
    expect(starts[0]).toMatch(/^req_/);
    expect(progress).toEqual([]);
  });

  it("ignores an id that is not well formed", async () => {
    const response = await fetch(`${proxyUrl}?_s=api&_m=upload`, {
      method: "POST",
      headers: { "x-courier-rid": "<script>" },
      body: form(),
    });

    expect(response.status).toBe(200);
    expect(starts[0]).toMatch(/^req_/);
  });
});

describe("a direct upload", () => {
  it("is reported under the id its request:start carries", async () => {
    const client = createCaller(api());

    await client.with({ onUploadProgress: () => {} }).upload(form());

    const [id] = starts;
    expect(id).toBeDefined();
    expect(progress.length).toBeGreaterThan(0);
    expect(new Set(progress.map((p) => p.requestId))).toEqual(new Set([id]));
    expect(progress.at(-1)).toMatchObject({ source: "api", method: "upload", percentage: 100 });
    expect(completed).toEqual([id]);
  });
});
