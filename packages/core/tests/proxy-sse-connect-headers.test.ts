/**
 * A proxied stream's headers made for one connection only: each connection
 * asks for its own, a reconnection's too, beside the stream's own headers
 * and the browser's credentials.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProxySSEFactory } from "../src/transport/proxy/sse";

const encoder = new TextEncoder();

/* A stream that says one event and drops, as a connection lost mid-stream does. */
function droppedStream(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"n":1}\n\n'));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a proxied stream with headers for each connection", () => {
  it("asks for them afresh on every connection, keeping its own headers and credentials", async () => {
    const sent: Array<{
      headers: Record<string, string>;
      credentials?: RequestCredentials | undefined;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push({
          headers: init.headers as Record<string, string>,
          credentials: init.credentials,
        });
        return droppedStream();
      }),
    );
    let made = 0;
    const subscribe = createProxySSEFactory("api", {
      proxyPath: { sse: "http://app.localhost/api/sse" },
      headers: { "x-own": "kept" },
      connectHeaders: () => ({ "x-once": `pass-${++made}` }),
    });

    const subscription = subscribe("live", "feed", {}, {});
    await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(2), { timeout: 5_000 });
    subscription.close();

    expect(sent[0]?.headers).toMatchObject({ "x-own": "kept", "x-once": "pass-1" });
    expect(sent[1]?.headers).toMatchObject({ "x-own": "kept", "x-once": "pass-2" });
    expect(sent[0]?.credentials).toBe("include");
  });

  it("asks for nothing when it has none, and sends only its own", async () => {
    const sent: Array<Record<string, string>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(init.headers as Record<string, string>);
        return droppedStream();
      }),
    );
    const subscribe = createProxySSEFactory("api", {
      proxyPath: { sse: "http://app.localhost/api/sse" },
      headers: { "x-own": "kept" },
    });

    const subscription = subscribe("live", "feed", {}, {});
    await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(1));
    subscription.close();

    expect(Object.keys(sent[0] ?? {}).sort()).toEqual(["accept", "x-own"]);
  });
});
