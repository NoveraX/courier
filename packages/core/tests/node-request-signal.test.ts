/**
 * The Web request a Node adapter builds, and what its signal says about the
 * client.
 *
 * The signal never fired, so an SSE stream behind express, fastify or nestjs
 * never learned its client had left: the generator, the upstream subscription
 * and the connection slot lived on until the lifetime cap.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { toWebRequest } from "../src/node";

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
});

/** Start a server that holds each response open and reports its request's signal. */
async function holdOpen(onSignal: (signal: AbortSignal) => void): Promise<string> {
  server = createServer((req, res) => {
    onSignal(toWebRequest(req, res).signal);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(": open\n\n");
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("toWebRequest with its response", () => {
  it("aborts the signal when the client leaves before the response ends", async () => {
    let signal: AbortSignal | undefined;
    const url = await holdOpen((s) => {
      signal = s;
    });

    const client = new AbortController();
    const response = await fetch(url, { signal: client.signal });
    await response.body?.getReader().read();
    client.abort();

    await expect.poll(() => signal?.aborted, { timeout: 2000 }).toBe(true);
  });

  it("does not abort a response that finished normally", async () => {
    let signal: AbortSignal | undefined;
    server = createServer((req, res) => {
      signal = toWebRequest(req, res).signal;
      res.end("done");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));

    await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)).text();

    expect(signal?.aborted).toBe(false);
  });
});
