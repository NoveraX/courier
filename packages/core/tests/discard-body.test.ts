/**
 * A refused proxy request, served by a framework that builds its own Web
 * request from the connection.
 *
 * SvelteKit, Nuxt and React Router hand the handler a body that is already
 * being read from the socket, so Node no longer discards what the handler
 * leaves. Whatever the proxy refuses it must still take off the connection:
 * a browser reads the refusal only once its upload is done, and until then it
 * waited for the server's keep-alive timer to close the socket.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { sendWebResponse } from "../src/node";
import { type BrowserUpload, sendLikeABrowser } from "./helpers/send-like-a-browser";

const SIXTEEN_MB = 16 * 1_048_576;
const SAME_ORIGIN = { origin: "http://127.0.0.1" } as const;

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** A server whose framework reads the body into a Web stream as it arrives. */
async function serveLikeAFramework(config?: HandlerConfig): Promise<number> {
  const { handle } = createHandler(config);
  server = createServer(async (req, res) => {
    const body = req.method === "GET" ? undefined : (Readable.toWeb(req) as ReadableStream);
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
      // @ts-expect-error -- required by the platform for a streaming body
      duplex: "half",
    });
    await sendWebResponse(await handle(request), res);
  });
  server.keepAliveTimeout = 60_000;
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

const refusals: Array<[string, number, BrowserUpload, HandlerConfig?]> = [
  [
    "a declared body over the limit",
    413,
    { method: "POST", headers: { ...SAME_ORIGIN, "content-type": "application/json" }, bytes: SIXTEEN_MB },
  ],
  [
    "a chunked body that crosses the limit",
    413,
    {
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-type": "application/json" },
      bytes: SIXTEEN_MB,
      chunked: true,
    },
  ],
  [
    "an upload over the upload limit",
    413,
    {
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-type": "multipart/form-data; boundary=x" },
      bytes: SIXTEEN_MB,
    },
  ],
  [
    "an unsupported content type",
    415,
    { method: "POST", headers: { ...SAME_ORIGIN, "content-type": "text/plain" }, bytes: SIXTEEN_MB },
  ],
  [
    "a disallowed origin",
    403,
    {
      method: "POST",
      headers: { origin: "https://elsewhere.example", "content-type": "application/json" },
      bytes: SIXTEEN_MB,
    },
    { allowedOrigins: ["http://127.0.0.1"] },
  ],
  [
    "an unsupported method",
    405,
    { method: "PUT", headers: { ...SAME_ORIGIN, "content-type": "application/json" }, bytes: SIXTEEN_MB },
  ],
  [
    "a POST whose URL names no endpoint",
    400,
    {
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-type": "application/json" },
      bytes: SIXTEEN_MB,
      path: "/api/request",
    },
  ],
];

describe("a refusal reaches a browser that is still uploading", () => {
  it.each(refusals)("for %s", async (_, status, upload, config) => {
    const port = await serveLikeAFramework(config);

    const answer = await sendLikeABrowser(port, upload);

    expect(answer.error).toBeUndefined();
    expect(answer.status).toBe(status);
    expect(answer.elapsedMs).toBeLessThan(3000);
  }, 10_000);
});
