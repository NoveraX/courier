/**
 * What one SSE connection makes of the response a real server sends.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

let server: Server | undefined;
let requests = 0;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  requests = 0;
});

async function serve(respond: (res: ServerResponse) => void): Promise<string> {
  server = createServer((_req, res) => {
    requests += 1;
    respond(res);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/sse`;
}

/** What the subscription failed with, or how it went on when it did not fail within a second. */
async function failureOf(url: string): Promise<unknown> {
  const subscription = subscribeSSE<unknown>(url, { backoff: { initialMs: 10, jitter: false } });
  const reading = (async () => {
    for await (const _event of subscription) {
      // Nothing is expected; the subscription should fail.
    }
    return "ended without failing";
  })();
  const outcome = await Promise.race([
    reading.catch((error: unknown) => error),
    new Promise((resolve) => setTimeout(() => resolve("still reading"), 1000)),
  ]);
  subscription.close();
  return outcome;
}

describe("a successful response that is not an event stream", () => {
  it("fails the subscription without reconnecting when it is an HTML page", async () => {
    const url = await serve((res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><html><body><div id=root></div></body></html>");
    });

    const failure = await failureOf(url);

    expect(failure).toBeInstanceOf(ConnectionError);
    expect(failure).toMatchObject({ statusCode: 200 });
    expect(String(failure)).toContain("text/html");
    expect(requests).toBe(1);
  });

  it("fails the subscription without reconnecting when it is JSON", async () => {
    const url = await serve((res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: 1 }));
    });

    await expect(failureOf(url)).resolves.toBeInstanceOf(ConnectionError);
    expect(requests).toBe(1);
  });

  it("fails the subscription without reconnecting when it has no content", async () => {
    const url = await serve((res) => {
      res.writeHead(204);
      res.end();
    });

    await expect(failureOf(url)).resolves.toBeInstanceOf(ConnectionError);
    expect(requests).toBe(1);
  });

  it("reads an event stream whose type carries parameters", async () => {
    const url = await serve((res) => {
      res.writeHead(200, { "Content-Type": "Text/Event-Stream; charset=utf-8" });
      res.end('data: 1\n\nevent: courier:complete\ndata: null\n\n');
    });
    const seen: unknown[] = [];

    for await (const event of subscribeSSE<number>(url)) seen.push(event.data);

    expect(seen).toEqual([1]);
  });
});
