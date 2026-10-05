/**
 * @vitest-environment jsdom
 */
/**
 * The Playground history is kept by Studio, for the project: a page that
 * connects is shown the calls made before — in another browser, before
 * Studio restarted — and each call it makes is sent back, rather than kept
 * in one browser's storage and nowhere else.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket as ServerSocket } from "socket.io";
import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindPlaygroundHistory } from "@/socket/playground-history-bindings";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

const KEPT: PlaygroundHistoryEntry = {
  id: "e1",
  rid: "r1",
  source: "api",
  group: "users",
  method: "list",
  variables: "{}",
  headers: "{}",
  mode: "direct",
  timestamp: 1,
  status: "success",
  statusCode: 200,
  response: [{ id: 1 }],
};

let server: Server | undefined;
const stops: Array<() => void> = [];

/** A Studio that keeps `kept`, and records what the pages send back. */
async function studio(kept: unknown[]): Promise<{ url: string; saved: unknown[][] }> {
  const http = createServer();
  server = new Server(http);
  const saved: unknown[][] = [];
  server.of("/ui").on("connection", (socket: ServerSocket) => {
    socket.emit("playground:history", kept);
    socket.on("playground:history:save", (entries: unknown[]) => saved.push(entries));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/ui`, saved };
}

async function connect(url: string): Promise<void> {
  const socket = io(url, { transports: ["websocket"] });
  const unbind = bindPlaygroundHistory(socket, useStudioStore);
  stops.push(() => {
    unbind();
    socket.disconnect();
  });
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
}

beforeEach(() => {
  useStudioStore.setState({ playgroundHistory: [], studioInfo: null });
});

afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe("the Playground history", () => {
  it("is shown to a page that connects as Studio kept it, and not sent back as it came", async () => {
    const { url, saved } = await studio([KEPT]);

    await connect(url);

    await vi.waitFor(() => expect(useStudioStore.getState().playgroundHistory).toEqual([KEPT]));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(saved).toEqual([]);
  });

  it("is sent to Studio as the page changes it", async () => {
    const { url, saved } = await studio([]);
    await connect(url);
    const call = { ...KEPT, id: "e2", rid: "r2" };

    useStudioStore.setState({ playgroundHistory: [call] });

    await vi.waitFor(() => expect(saved).toEqual([[call]]), { timeout: 2_000 });
  });

  it("stays in the page of a public demo's visitor, which sends none", async () => {
    const { url, saved } = await studio([]);
    useStudioStore.setState({
      studioInfo: {
        version: "1.0.0",
        startedAt: 1,
        project: { name: "demo-shop", dependencies: [] },
        demo: {},
      },
    });
    await connect(url);

    useStudioStore.setState({ playgroundHistory: [{ ...KEPT, id: "e3", rid: "r3" }] });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(saved).toEqual([]);
  });

  it("is the page's own after a reconnect, not the older one Studio kept", async () => {
    const mine = { ...KEPT, id: "e9", rid: "r9" };
    useStudioStore.setState({ playgroundHistory: [mine] });
    const { url } = await studio([KEPT]);

    await connect(url);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(useStudioStore.getState().playgroundHistory).toEqual([mine]);
  });
});
