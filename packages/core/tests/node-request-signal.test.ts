/**
 * The Web request a Node adapter builds, and what its signal says about the
 * client.
 *
 * The signal fires when the client leaves, so an SSE stream behind express,
 * fastify or nestjs learns of it: otherwise the generator, the upstream
 * subscription and the connection slot would live on until the lifetime
 * cap. It does so after the request itself was let go of and collected,
 * as it is once a handler has returned a streamed answer.
 */
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

  it("still hears the client leave once the request was let go of and collected", () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const script = join(__dirname, "fixtures/request-signal-after-collection.ts");

    const run = spawnSync(process.execPath, ["--expose-gc", "--import", tsx, script], {
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ heard: 10, clients: 10, kept: 10 });
  });
});
