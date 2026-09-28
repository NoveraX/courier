/**
 * The request body limits a standalone server applies. Every framework
 * adapter lets them be set; the standalone server passed neither on, so an
 * upload over 10 MB was always refused with 413.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { sendLikeABrowser } from "../../core/tests/helpers/send-like-a-browser";
import { createCourierServer } from "../src/create-server";
import type { CourierServer, CourierServerOptions } from "../src/types";

const { endpoint } = courier();
const MB = 1024 * 1024;

let upstream: Server;
let upstreamURL = "";
let server: CourierServer | undefined;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => upstream.close(() => resolve())));

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function serve(limits: Partial<CourierServerOptions>): Promise<string> {
  const api = defineApi({
    baseURL: upstreamURL,
    endpoints: { upload: endpoint.post("upload"), save: endpoint.post("save") },
  });
  server = createCourierServer({ sources: { api }, port: 0, host: "127.0.0.1", signals: false, ...limits });
  return server.ready;
}

function upload(url: string, bytes: number): Promise<Response> {
  const form = new FormData();
  form.set("_source", "api");
  form.set("_method", "upload");
  form.set("file", new Blob([new Uint8Array(bytes)]), "big.bin");
  return fetch(`${url}/api/request`, { method: "POST", body: form });
}

function save(url: string, text: string): Promise<Response> {
  return fetch(`${url}/api/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "api", method: "save", variables: { text } }),
  });
}

describe("maxUploadBytes", () => {
  it("accepts an upload over 10 MB when raised", async () => {
    const url = await serve({ maxUploadBytes: 32 * MB });

    const res = await upload(url, 12 * MB);

    expect(res.status).toBe(200);
  }, 30_000);

  it("refuses an upload over a lowered limit", async () => {
    const url = await serve({ maxUploadBytes: 64 * 1024 });

    const res = await upload(url, 256 * 1024);

    expect(res.status).toBe(413);
  });
});

/**
 * A browser reads the answer only once its upload is done or the socket
 * closes. A refusal that left the rest of the body on the connection reached
 * it when the keep-alive timer closed the socket, about 6 s later.
 */
describe("a body refused before it is read", () => {
  const port = (url: string) => Number(new URL(url).port);

  it.each([
    ["a declared JSON envelope", "application/json", false],
    ["a chunked JSON envelope", "application/json", true],
    ["a declared upload", "multipart/form-data; boundary=x", false],
    ["a chunked upload", "multipart/form-data; boundary=x", true],
  ])("reaches a browser promptly for %s", async (_name, contentType, chunked) => {
    const url = await serve({ maxBodyBytes: 1024, maxUploadBytes: 1024 });

    const answer = await sendLikeABrowser(port(url), {
      method: "POST",
      headers: { "content-type": contentType },
      bytes: 16 * MB,
      chunked,
    });

    expect(answer.error).toBeUndefined();
    expect(answer.status).toBe(413);
    expect(answer.elapsedMs).toBeLessThan(500);
  }, 10_000);
});

describe("maxBodyBytes", () => {
  it("refuses a JSON envelope over a lowered limit", async () => {
    const url = await serve({ maxBodyBytes: 1024 });

    const res = await save(url, "x".repeat(4096));

    expect(res.status).toBe(413);
  });

  it("accepts a JSON envelope over 1 MB when raised", async () => {
    const url = await serve({ maxBodyBytes: 4 * MB });

    const res = await save(url, "x".repeat(2 * MB));

    expect(res.status).toBe(200);
  });
});
