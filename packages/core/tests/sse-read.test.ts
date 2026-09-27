/**
 * What one SSE connection makes of the response a real server sends.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionError } from "../src/realtime/errors";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

let server: Server | undefined;
let requests = 0;
const resumedFrom: (string | undefined)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  requests = 0;
  resumedFrom.length = 0;
});

async function serve(respond: (res: ServerResponse, request: number) => void): Promise<string> {
  server = createServer((req, res) => {
    requests += 1;
    const lastEventId = req.headers["last-event-id"];
    resumedFrom.push(typeof lastEventId === "string" ? lastEventId : undefined);
    respond(res, requests);
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

/** A server whose first response is `first`, and whose next one says where it resumed. */
function resumingServer(first: string): Promise<string> {
  return serve((res, request) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (request === 1) {
      res.end(first);
      return;
    }
    res.end(
      `data: ${JSON.stringify({ resumedFrom: resumedFrom.at(-1) ?? null })}\n\n` +
        "event: courier:complete\ndata: null\n\n",
    );
  });
}

async function readAll(url: string): Promise<{ id?: string; event?: string; data: unknown }[]> {
  const seen: { id?: string; event?: string; data: unknown }[] = [];
  const subscription = subscribeSSE<unknown>(url, { backoff: { initialMs: 10, jitter: false } });
  for await (const event of subscription) seen.push(event);
  return seen;
}

describe("a response that ends in the middle of an event", () => {
  it("drops the partial event and resumes after the last whole one", async () => {
    const url = await resumingServer("id: 4\ndata: 4\n\nid: 5\ndata: 12");

    const seen = await readAll(url);

    expect(seen.map((event) => event.data)).toEqual([4, { resumedFrom: "4" }]);
    expect(resumedFrom).toEqual([undefined, "4"]);
  });
});

describe("blocks the stream sends", () => {
  it("are told apart whatever mix of line endings separates them", async () => {
    const url = await serve((res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("data: 1\n\r\ndata: 2\r\n\ndata: 3\n\nevent: courier:complete\ndata: null\n\n");
    });

    const seen = await readAll(url);

    expect(seen.map((event) => event.data)).toEqual([1, 2, 3]);
  });

  it("that only set a retry or an id deliver nothing, warn of nothing, and move the resume point", async () => {
    const warn = vi.spyOn(console, "warn");
    const url = await resumingServer("retry: 20\n\nid: 77\n\n");

    const seen = await readAll(url);

    expect(seen.map((event) => event.data)).toEqual([{ resumedFrom: "77" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("with an empty event field arrive with no event type", async () => {
    const url = await serve((res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("event:\ndata: 1\n\nevent: courier:complete\ndata: null\n\n");
    });

    const seen = await readAll(url);

    expect(seen).toEqual([{ data: 1 }]);
  });
});
