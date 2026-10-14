/**
 * @vitest-environment jsdom
 */

import { isConfigurationError } from "@noverax/courier";
import { routesOf } from "@noverax/courier/internal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { type CourierServer, startCourierServer } from "./helpers/courier-server";
import { liveApi } from "./helpers/live-api";

let server: CourierServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCaller() {
  return createProxyQueryCaller(routesOf(liveApi, "api"), { proxyPath: server.proxyPath });
}

beforeEach(async () => {
  /* jsdom's WebSocket hands Node's event target its own Event class and
     never opens; the ws client is what it would have used underneath. */
  vi.stubGlobal("WebSocket", WebSocket);
  server = await startCourierServer({ api: liveApi });
  queryClient = new QueryClient();
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
  vi.unstubAllGlobals();
});

describe("useChannel over a real WebSocket", () => {
  it("forgets the last message of the previous room when its variables change", async () => {
    const q = makeCaller();
    const { result, rerender } = renderHook(
      ({ room }) => q.live.useChannel("room", { variables: { room } }),
      { wrapper, initialProps: { room: "r1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));
    act(() => result.current.send({ text: "hi" }));
    await waitFor(() => expect(result.current.lastMessage).toEqual({ echo: "hi", room: "r1" }));

    rerender({ room: "r2" });

    expect(result.current.lastMessage).toBeUndefined();
    await waitFor(() => expect(result.current.status).toBe("connected"));
    act(() => result.current.send({ text: "again" }));
    await waitFor(() => expect(result.current.lastMessage).toEqual({ echo: "again", room: "r2" }));
  });

  it("delivers a message sent from the component's own mount effect", async () => {
    const q = makeCaller();
    const { result, rerender } = renderHook(
      ({ room }) => {
        const channel = q.live.useChannel("room", { variables: { room } });
        const { send } = channel;
        useEffect(() => {
          send({ text: `hello-${room}` });
        }, [send, room]);
        return channel;
      },
      { wrapper, initialProps: { room: "r1" } },
    );

    await waitFor(() =>
      expect(result.current.lastMessage).toEqual({ echo: "hello-r1", room: "r1" }),
    );

    rerender({ room: "r2" });

    await waitFor(() =>
      expect(result.current.lastMessage).toEqual({ echo: "hello-r2", room: "r2" }),
    );
  });

  it("reports a missing WebSocket proxy path through error and onError", async () => {
    const q = createProxyQueryCaller(routesOf(liveApi, "api"), {
      proxyPath: { http: server.proxyPath.http, sse: server.proxyPath.sse },
    });
    const onError = vi.fn();

    const { result } = renderHook(
      () => q.live.useChannel("room", { variables: { room: "r1" }, onError }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(isConfigurationError(result.current.error)).toBe(true);
    expect(result.current.error?.code).toBe("WS_PATH_NOT_CONFIGURED");
    expect(onError).toHaveBeenCalledWith(result.current.error);
    expect(result.current.status).toBe("disconnected");
  });
});
