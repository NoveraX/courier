/**
 * @vitest-environment jsdom
 */

/**
 * The React callers' `ws` option reaches the socket `useChannel` opens.
 *
 * Neither React caller took one, so a channel could not send a token on
 * connecting nor answer a server that asked for a fresh one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createWSHandler, registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { clearWSConnectionPool } from "@noverax/courier/internal-streams";
import { attachWebSocketUpgrade, type UpgradeServer } from "@noverax/courier/node";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { createQueryCaller } from "../src/create-query-caller";
import { liveApi } from "./helpers/live-api";

const PAGE_ORIGIN = "http://localhost:3000";
const { channel } = courier();

let server: Server;
let host: string;
let queryClient: QueryClient;
const tokens: (string | null)[] = [];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(async () => {
  vi.stubGlobal("WebSocket", WebSocket);
  registerSources({ api: liveApi });
  const ws = createWSHandler({
    allowedOrigins: [PAGE_ORIGIN],
    onConnect: ({ request }) => {
      tokens.push(new URL(request.url).searchParams.get("token"));
      return {};
    },
  });
  server = createServer();
  attachWebSocketUpgrade(server, {
    path: undefined,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => ws.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  queryClient = new QueryClient();
});

afterEach(async () => {
  queryClient.clear();
  clearWSConnectionPool();
  tokens.length = 0;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllGlobals();
});

describe("the ws option of a React caller", () => {
  it("sends the proxy caller's token when useChannel connects", async () => {
    const q = createProxyQueryCaller<typeof liveApi>("api", {
      source: liveApi,
      proxyPath: { ws: `ws://${host}/api/ws` },
      ws: { getAuthToken: () => "proxy-token" },
    });

    const { result } = renderHook(() => q.live.useChannel("room", { variables: { room: "r1" } }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(tokens).toEqual(["proxy-token"]);
  });

  it("sends the direct caller's token when useChannel connects", async () => {
    const remote = defineApi({
      name: "api",
      baseURL: `http://${host}`,
      groups: {
        live: defineGroup({
          prefix: "live",
          endpoints: {
            room: channel
              .variables<{ room: string }>()
              .send<{ text: string }>()
              .response<{ echo: string; room: string }>()
              .connect("room"),
          },
        }),
      },
    });
    const q = createQueryCaller(remote, { ws: { getAuthToken: () => "direct-token" } });

    const { result } = renderHook(() => q.live.useChannel("room", { variables: { room: "r1" } }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(tokens).toEqual(["direct-token"]);
  });
});
