/**
 * A UI that connects is served even when the project cannot be replayed to
 * it: socket.io calls the connection handler outside any promise, so a throw
 * there would take Studio down on every connect.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import type { LifecycleCoordinator } from "../src/server/mock-manager";
import type { ProjectImports } from "../src/server/project-state/types";
import { createRequestLog, MAX_REQUESTS } from "../src/server/request-log";
import { createRequestPins } from "../src/server/storage/request-pins";
import { openStudioDb } from "../src/server/storage/studio-db";
import type { StudioToken } from "../src/server/studio-token";
import { setupUiNamespace } from "../src/server/ui-namespace";
import { createUpdateChecks } from "../src/server/update-checks";
import { createWatcherStatus } from "../src/server/watcher-status";

const cleanups: Array<() => Promise<void> | void> = [];

const STARTING = { revision: 0, starting: true, running: null, loadedAt: null, failure: null };

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

/* The page's token; a page presenting it may change what Studio runs. */
const TOKEN: StudioToken = {
  value: "page-token",
  matches: (candidate) => candidate === "page-token",
};

describe("setupUiNamespace", () => {
  it("logs a replay that throws and still serves the UI the rest of its state", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { io, url } = await listening();
    const uiNamespace = io.of("/ui");
    const project: ProjectImports = {
      snapshot: () => {
        throw new Error("the snapshot could not be read");
      },
      fresh: async () => {
        throw new Error("a UI is sent the project as it is, never after catching up");
      },
      importsChanged: () => undefined,
      updateChecks: createUpdateChecks(),
    };
    setupUiNamespace({
      uiNamespace,
      bindingTable: new BindingTable(),
      project,
      projectRoot: "/app",
      watcherStatus: createWatcherStatus(uiNamespace),
      token: TOKEN,
    });

    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    cleanups.push(() => {
      socket.disconnect();
    });
    const events: string[] = [];
    socket.onAny((event: string) => {
      events.push(event);
    });
    await vi.waitFor(() => expect(events).toContain("watcher:status"), { timeout: 5000 });

    expect(events).toEqual(["studio:info", "binding:snapshot", "watcher:status"]);
    const logged = warn.mock.calls.map((call) => call.join(" "));
    expect(
      logged.some((line) => line.includes("Failed to send the project to a UI that connected")),
    ).toBe(true);
  });

  it("acknowledges a mock command with the mock's answer, and says why when there is none", async () => {
    const { io, url } = await listening();
    const uiNamespace = io.of("/ui");
    const forwarded: unknown[] = [];
    const mockManager: LifecycleCoordinator = {
      stop: async () => {},
      handleCommand: () => {},
      forwardStoreCommand: (command) => {
        forwarded.push(command);
        if (command.serverId !== "apiMock") return undefined;
        return Promise.resolve({ ok: false, error: "users has no record with id 9" });
      },
      sendSnapshot: () => {},
      summarizeServers: () => [],
      describeServers: () => [],
      recordsIn: () => undefined,
      setMocksFile: () => {},
    };
    setupUiNamespace({
      uiNamespace,
      bindingTable: new BindingTable(),
      project: {
        snapshot: () => STARTING,
        fresh: async () => ({ ...STARTING, settling: false }),
        importsChanged: () => undefined,
        updateChecks: createUpdateChecks(),
      },
      projectRoot: "/app",
      mockManager,
      token: TOKEN,
    });
    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: { token: TOKEN.value },
    });
    cleanups.push(() => {
      socket.disconnect();
    });
    const update = {
      action: "mock:store:update",
      serverId: "apiMock",
      collection: "users",
      id: 9,
      data: {},
    };

    const answered = await socket.timeout(5000).emitWithAck("mock:command", update);
    const unknownMock = await socket
      .timeout(5000)
      .emitWithAck("mock:command", { action: "mock:store:seed", serverId: "other" });
    const unreadable = await socket
      .timeout(5000)
      .emitWithAck("mock:command", { serverId: "apiMock" });

    expect(forwarded).toEqual([update, { action: "mock:store:seed", serverId: "other" }]);
    expect(answered).toEqual({ ok: false, error: "users has no record with id 9" });
    expect(unknownMock).toEqual({ ok: false, error: 'No mock is named "other".' });
    expect(unreadable).toEqual({ ok: false, error: "Studio could not read the command." });
  });
});

describe("the pins a page is sent", () => {
  it("are taken from a page without the token as its replay is cut, and sent it after the replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-ui-pins-"));
    const opened = openStudioDb(dir);
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => opened.close());
    const pins = createRequestPins(opened.db);
    const requestLog = createRequestLog(opened.db, undefined, (id) => pins.has(id));
    /* A log long enough that its replay is cut over many turns of the event loop. */
    for (let n = 0; n < MAX_REQUESTS; n++) {
      requestLog.record(
        { type: "request:start", id: `r${n}`, source: "api", method: "login", variables: { n } },
        "s1",
      );
      requestLog.record({ type: "request:end", requestId: `r${n}`, status: 200, data: {} }, "s1");
    }
    const { io, url } = await listening();
    const uiNamespace = io.of("/ui");
    setupUiNamespace({
      uiNamespace,
      bindingTable: new BindingTable(),
      project: {
        snapshot: () => STARTING,
        fresh: async () => ({ ...STARTING, settling: false }),
        importsChanged: () => undefined,
        updateChecks: createUpdateChecks(),
      },
      projectRoot: "/app",
      requestLog,
      pins,
      token: TOKEN,
      /* As the public demo's visitors may: pin a request. */
      visitors: {
        decide: (_visitor, event) =>
          event === "requests:pin" ? { kind: "run" } : { kind: "drop" },
        forget: () => {},
      },
    });

    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    cleanups.push(() => {
      socket.disconnect();
    });
    const order: string[] = [];
    socket.onAny((event: string) => {
      order.push(event);
      if (event === "studio:info") socket.emit("requests:pin", { id: "r7", pinned: true });
    });
    await vi.waitFor(() => expect(order).toContain("requests:pinned"), { timeout: 10_000 });

    expect(pins.ids()).toEqual(["r7"]);
    expect(order.indexOf("events:replay")).toBeGreaterThan(-1);
    expect(order.indexOf("events:replay")).toBeLessThan(order.indexOf("requests:pinned"));
  });
});
