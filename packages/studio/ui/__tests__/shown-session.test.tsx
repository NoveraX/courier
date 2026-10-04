/**
 * @vitest-environment jsdom
 */
/**
 * A page that loaded a saved session shows it again after a reload: Studio
 * keeps the session shown, and sends it to a page that connects, after the
 * live requests. Going back to live tells Studio, which sends the live
 * requests again.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { act, renderHook } from "@testing-library/react";
import { Server, type Socket as ServerSocket } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const page = vi.hoisted(() => ({ socket: undefined as Socket | undefined }));
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => page.socket }));

import { useBackToLive } from "@/hooks/use-back-to-live";
import { buildBindings, unbind } from "@/socket/socket-bindings";
import { useStudioStore } from "@/store";

let server: Server | undefined;
const stops: Array<() => void> = [];

const LIVE = [
  {
    id: "live-1",
    type: "request:start",
    timestamp: 1_000,
    sessionId: "server",
    source: "api",
    method: "list",
  },
];
const SAVED = {
  id: "s_1",
  name: "login flow",
  requests: [
    {
      id: "r1",
      source: "api",
      method: "login",
      variables: { user: "ada" },
      mode: "direct",
      status: "success",
      statusCode: 200,
      startedAt: 500,
      sessionId: "s",
    },
  ],
};

/** A Studio that shows `shown` to each page that connects, and records what the pages ask. */
async function studio(shown: unknown): Promise<{ url: string; asked: string[] }> {
  const http = createServer();
  server = new Server(http);
  const asked: string[] = [];
  server.of("/ui").on("connection", (socket: ServerSocket) => {
    socket.emit("events:replay", LIVE);
    if (shown) socket.emit("view:session", shown);
    socket.on("view:live", () => {
      asked.push("view:live");
      socket.emit("events:replay", LIVE);
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/ui`, asked };
}

async function connectPage(url: string): Promise<void> {
  const socket = io(url, { transports: ["websocket"] });
  page.socket = socket;
  const bindings = buildBindings(socket, useStudioStore.getState);
  stops.push(() => {
    unbind(socket, bindings);
    socket.disconnect();
  });
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
}

beforeEach(() => {
  useStudioStore.setState({ requests: [], paused: false, shownSession: null, droppedRequests: 0 });
});

afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("a page that connects while the pages show a saved session", () => {
  it("shows the session in place of the live requests, recording paused", async () => {
    const { url } = await studio(SAVED);

    await connectPage(url);

    await vi.waitFor(() =>
      expect(useStudioStore.getState().shownSession).toEqual({ id: "s_1", name: "login flow" }),
    );
    const state = useStudioStore.getState();
    expect(state.requests.map((request) => request.id)).toEqual(["r1"]);
    expect(state.paused).toBe(true);
  });

  it("goes back to the live requests, and tells Studio", async () => {
    const { url, asked } = await studio(SAVED);
    await connectPage(url);
    await vi.waitFor(() => expect(useStudioStore.getState().shownSession).not.toBeNull());
    const { result } = renderHook(() => useBackToLive());

    act(() => result.current());

    await vi.waitFor(() =>
      expect(useStudioStore.getState().requests.map((request) => request.id)).toEqual(["live-1"]),
    );
    expect(asked).toEqual(["view:live"]);
    expect(useStudioStore.getState()).toMatchObject({ shownSession: null, paused: false });
  });
});

describe("a page that connects while the pages show the live requests", () => {
  it("shows them, recording on", async () => {
    const { url } = await studio(undefined);

    await connectPage(url);

    await vi.waitFor(() =>
      expect(useStudioStore.getState().requests.map((request) => request.id)).toEqual(["live-1"]),
    );
    expect(useStudioStore.getState()).toMatchObject({ shownSession: null, paused: false });
  });
});
