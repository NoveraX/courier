/**
 * The headers a Playground stream through the app's proxy route is opened
 * with. A pass the Playground was given is never sent, on any transport:
 * an SSE connection carries a fresh pass of its own, made for each
 * connection, and a WebSocket — whose handler asks for none — carries no
 * pass at all. The core factories stand in at the boundary, so nothing is
 * opened.
 */
import { setAppOrigin } from "@noverax/courier";
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import type * as Internal from "@noverax/courier/internal";
import { PLAYGROUND_RID_HEADER, STUDIO_PASS_HEADER } from "@noverax/courier/internal";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openChannelThroughProxy, openStreamThroughProxy } from "../src/runtime/proxy-openers";

interface StreamOptions {
  headers?: Record<string, string>;
  connectHeaders?: () => Record<string, string>;
}

const opened = vi.hoisted(() => ({ with: [] as Array<{ sse: StreamOptions; ws: StreamOptions }> }));

vi.mock("@noverax/courier/internal", async (importOriginal) => {
  const actual = await importOriginal<typeof Internal>();
  const handle = { close: () => {}, on: () => () => {}, send: () => {}, status: "open" };
  return {
    ...actual,
    proxyStreamingFactories: (
      _source: string,
      options: { sse: StreamOptions; ws: StreamOptions },
    ) => {
      opened.with.push(options);
      return { sse: () => handle, wsPush: () => handle, wsChannel: () => handle };
    },
  };
});

const { stream } = courier();
const sources: Sources = {
  api: defineApi({
    baseURL: "http://127.0.0.1:9",
    endpoints: { feed: stream.get("feed").response<unknown>() },
  }),
};

const TYPED = { "X-Courier-Studio-Pass": "A".repeat(43), accept: "*/*" };

afterEach(() => {
  opened.with.length = 0;
  setAppOrigin(undefined);
});

function call() {
  return { source: "api", group: "", method: "feed", variables: {}, headers: TYPED };
}

describe("a Playground stream through the proxy", () => {
  it("opens a WebSocket with the call's headers and no pass, whatever pass it was given", async () => {
    setAppOrigin("http://localhost:3000");

    await openChannelThroughProxy(sources, call(), {
      requestId: "pg_ws",
      signal: new AbortController().signal,
    });

    expect(opened.with[0]?.ws.headers).toEqual({ accept: "*/*" });
  });

  it("opens an SSE connection with a fresh pass of its own, never the one it was given", async () => {
    setAppOrigin("http://localhost:3000");

    await openStreamThroughProxy(sources, call(), {
      requestId: "pg_sse",
      signal: new AbortController().signal,
    });

    const sse = opened.with[0]?.sse;
    expect(sse?.headers).toEqual({ accept: "*/*", [PLAYGROUND_RID_HEADER]: "pg_sse" });
    const fresh = sse?.connectHeaders?.()[STUDIO_PASS_HEADER];
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fresh).not.toBe(TYPED["X-Courier-Studio-Pass"]);
  });
});
