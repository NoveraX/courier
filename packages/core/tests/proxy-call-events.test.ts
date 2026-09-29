/**
 * What Studio learns about a proxied upload, and when, over real HTTP.
 *
 * The endpoint used to sit at the end of a multipart body, so the proxy knew
 * which call an upload was for only once all of it had arrived: Studio showed
 * nothing while a large upload was on its way, and nothing at all for one the
 * proxy refused with 413. A call now names its endpoint in its URL and is
 * announced as it arrives.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { studioHooks } from "../src/studio";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const BOUNDARY = "courier-test";
let upstream: Upstream;
let server: Server;
let port = 0;

const events: Array<{ type: string; id?: string; status?: number; variables?: unknown }> = [];

beforeEach(async () => {
  upstream = await startUpstream(echo);
  registerSources({
    api: defineApi({ baseURL: upstream.url, endpoints: { upload: endpoint.post("upload") } }),
  });
  const handler = createHandler({ maxUploadBytes: 1024 });
  server = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;

  studioHooks.onRequestStart = (e) =>
    events.push({ type: "start", id: e.id, variables: e.variables });
  studioHooks.onRequestEnd = (e) => events.push({ type: "end", id: e.id, status: e.status });
  studioHooks.onRequestError = (e) =>
    events.push({ type: "error", id: e.id, status: e.error.status });
  studioHooks.onProxyParse = (e) => events.push({ type: "parse", id: e.requestId });
});

afterEach(async () => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onRequestEnd = undefined;
  studioHooks.onRequestError = undefined;
  studioHooks.onProxyParse = undefined;
  events.length = 0;
  _resetSourcesForTests();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await upstream.close();
});

/** A multipart body holding one text field, framed by hand so it can be sent in parts. */
function multipart(value: string): { head: string; tail: string } {
  return {
    head: `--${BOUNDARY}\r\nContent-Disposition: form-data; name="note"\r\n\r\n`,
    tail: `${value}\r\n--${BOUNDARY}--\r\n`,
  };
}

/** Start an upload to `api.upload`, and resolve with its status once it is answered. */
function startUpload(length?: number) {
  let settle: (status: number) => void = () => {};
  const answered = new Promise<number>((resolve) => {
    settle = resolve;
  });
  const req = httpRequest(
    {
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/api/request?_s=api&_m=upload",
      headers: {
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
        ...(length === undefined ? {} : { "content-length": String(length) }),
      },
    },
    (res) => {
      res.resume();
      res.on("end", () => settle(res.statusCode ?? 0));
    },
  );
  req.on("error", () => settle(0));
  return { req, answered };
}

describe("an upload on its way", () => {
  it("is shown before its body has arrived, and completes under the same id", async () => {
    const { head, tail } = multipart("hello");
    const { req, answered } = startUpload();

    req.write(head);
    await vi.waitFor(() => expect(events.map((e) => e.type)).toEqual(["start"]));
    req.end(tail);

    expect(await answered).toBe(200);
    const [started] = events;
    expect(started?.variables).toBeUndefined();
    expect(events.map((e) => [e.type, e.id])).toEqual([
      ["start", started?.id],
      ["parse", started?.id],
      ["start", started?.id],
      ["end", started?.id],
    ]);
    expect(events[2]?.variables).toEqual({ note: "hello" });
  });
});

describe("an upload the proxy refuses", () => {
  it("ends with a request:error that carries the 413", async () => {
    const { req, answered } = startUpload(4096);

    req.end(Buffer.alloc(4096, 0x20));

    expect(await answered).toBe(413);
    expect(events.map((e) => e.type)).toEqual(["start", "error"]);
    expect(events[1]).toMatchObject({ id: events[0]?.id, status: 413 });
  });
});

describe("a call refused before it runs", () => {
  it("ends with request:error rather than staying pending", async () => {
    const answer = await fetch(`http://127.0.0.1:${port}/api/request?_s=api&_m=missing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variables: {} }),
    });

    expect(answer.status).toBe(400);
    expect(events.map((e) => e.type)).toEqual(["start", "parse", "error"]);
    expect(events[2]).toMatchObject({ id: events[0]?.id, status: 400 });
  });
});
