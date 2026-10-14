/**
 * @vitest-environment jsdom
 */

import { createProxyCaller } from "@noverax/courier";
import { routesOf } from "@noverax/courier/internal";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { useConnectionStatus } from "../src/hooks/use-connection-status";
import { type CourierServer, startCourierServer } from "./helpers/courier-server";
import { liveApi } from "./helpers/live-api";

let server: CourierServer;

function makeCaller() {
  return createProxyCaller(routesOf(liveApi, "api"), { proxyPath: server.proxyPath });
}

beforeEach(async () => {
  /* jsdom's WebSocket hands Node's event target its own Event class and
     never opens; the ws client is what it would have used underneath. */
  vi.stubGlobal("WebSocket", WebSocket);
  server = await startCourierServer({ api: liveApi });
});

afterEach(async () => {
  await server.close();
  vi.unstubAllGlobals();
});

describe("useConnectionStatus with what the callers return", () => {
  it("follows an SSE subscription", async () => {
    const subscription = makeCaller().live.ticks({ n: 2 });
    const seen: string[] = [];
    const { result } = renderHook(() => {
      const state = useConnectionStatus(subscription);
      if (seen.at(-1) !== state.status) seen.push(state.status);
      return state;
    });

    await waitFor(() => expect(seen).toContain("connected"));
    for await (const _event of subscription) {
      /* read the stream to its end */
    }
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
  });

  it("follows a WebSocket channel", async () => {
    const channel = makeCaller().live.room({ room: "r1" });
    const { result } = renderHook(() => useConnectionStatus(channel));

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    channel.close();

    await waitFor(() => expect(result.current.status).toBe("disconnected"));
  });
});
