/**
 * A UI that connects is served even when the project cannot be replayed to
 * it: socket.io calls the connection handler outside any promise, so a throw
 * there would take Studio down on every connect.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import type { ProjectReads } from "../src/server/project-state/types";
import { setupUiNamespace } from "../src/server/ui-namespace";
import { createWatcherStatus } from "../src/server/watcher-status";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

async function listening(): Promise<{ http: HttpServer; io: Server; url: string }> {
  const http = createServer();
  const io = new Server(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        io.close(() => resolve());
      }),
  );
  const address = http.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { http, io, url: `http://127.0.0.1:${port}` };
}

describe("setupUiNamespace", () => {
  it("logs a replay that throws and still serves the UI the rest of its state", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { io, url } = await listening();
    const uiNamespace = io.of("/ui");
    const project: ProjectReads = {
      snapshot: () => {
        throw new Error("the snapshot could not be read");
      },
    };
    setupUiNamespace({
      uiNamespace,
      bindingTable: new BindingTable(),
      project,
      projectRoot: "/app",
      watcherStatus: createWatcherStatus(uiNamespace),
    });

    const socket = connect(`${url}/ui`, { transports: ["websocket"], forceNew: true, reconnection: false });
    cleanups.push(() => {
      socket.disconnect();
    });
    const events: string[] = [];
    socket.onAny((event: string) => {
      events.push(event);
    });
    await vi.waitFor(() => expect(events).toContain("watcher:status"), { timeout: 5000 });

    expect(events).toEqual(["binding:snapshot", "watcher:status"]);
    const logged = warn.mock.calls.map((call) => call.join(" "));
    expect(logged.some((line) => line.includes("Failed to send the project to a UI that connected"))).toBe(true);
  });
});
