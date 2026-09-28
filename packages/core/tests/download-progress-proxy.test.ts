/**
 * Download progress through the proxy.
 *
 * The proxy re-serves an answer as a stream of its own, and it said nothing
 * about the length: every progress event carried a total of 0 and a percent
 * of 0, so a progress bar never moved and never finished. A streamed answer
 * dropped the upstream's length as well.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import type { DownloadProgress } from "../src/http-client/types";
import { sendWebResponse, toWebRequest } from "../src/node";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { trackDownload } from "../src/utils/progress";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const ROWS = JSON.stringify({ rows: "x".repeat(300_000) });
const BYTES = new Uint8Array(200_000).fill(3);
let upstream: Upstream;
let proxy: Server;
let proxyUrl: string;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    const body = request.url === "/bytes" ? BYTES : ROWS;
    res.writeHead(200, { "content-length": String(body.length) });
    res.end(body);
  });
  const source = api();
  registerSources({ big: source });
  const handler = createHandler();
  proxy = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/request`;
});

afterEach(async () => {
  _resetSourcesForTests();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await upstream.close();
});

function api() {
  return defineApi({
    name: "big",
    baseURL: upstream.url,
    endpoints: { rows: endpoint.get("rows"), bytes: endpoint.get("bytes") },
  });
}

function client() {
  return createProxyCaller<ReturnType<typeof api>>("big", {
    source: api(),
    proxyPath: { http: proxyUrl },
  });
}

describe("download progress through the proxy", () => {
  it("knows the answer's total and ends at 100%", async () => {
    const events: DownloadProgress[] = [];

    await client()
      .rows.with({ onDownloadProgress: (p: DownloadProgress) => events.push(p) })();

    const last = events.at(-1);
    expect(events[0]?.totalBytes).toBeGreaterThanOrEqual(ROWS.length);
    expect(last?.transferredBytes).toBe(events[0]?.totalBytes);
    expect(last?.percent).toBe(1);
  });

  it("knows the upstream's total for a streamed answer", async () => {
    const events: DownloadProgress[] = [];

    const body = await client()
      .bytes.with({ stream: true, onDownloadProgress: (p: DownloadProgress) => events.push(p) })();
    const received = new Uint8Array(await new Response(body as ReadableStream).arrayBuffer());

    expect(received).toEqual(BYTES);
    expect(events[0]?.totalBytes).toBe(BYTES.byteLength);
    expect(events.at(-1)).toEqual({
      percent: 1,
      transferredBytes: BYTES.byteLength,
      totalBytes: BYTES.byteLength,
    });
  });
});

describe("trackDownload for an answer of unknown length", () => {
  it("ends with an event at 100% of what arrived", async () => {
    const events: DownloadProgress[] = [];
    const answer = new Response(new Blob([new Uint8Array(5000)]).stream());

    await trackDownload(answer, (p) => events.push(p)).arrayBuffer();

    expect(events.at(-1)).toEqual({ percent: 1, transferredBytes: 5000, totalBytes: 5000 });
  });
});
