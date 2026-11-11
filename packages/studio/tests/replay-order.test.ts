/**
 * A page without the project's token is sent a log's replay before what
 * Studio sends it once it asked for one, as a page replayed at once is,
 * though its replay is read a while at a time: what it is sent meanwhile
 * waits behind the replay. A request that began before the page connected
 * and ended as its replay was read shows as ended, by the page's own
 * reducers. Past the bound of what a page is held, what waits is sent at
 * once and the replay read again, so it is no older than what was sent.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Namespace, Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { applyEvents } from "@/store/apply-events";
import { mergeReplayed } from "@/store/merge-replayed";
import type { RequestEntry } from "@/store/types";
import { HELD_MESSAGES } from "../src/server/page-holds";
import {
  admitPage,
  guardPageBroadcasts,
  replayToPage,
  toOpenPages,
} from "../src/server/page-outlet";
import { createRequestLog, MAX_REQUESTS, type RequestLog } from "../src/server/request-log";
import { openStudioDb } from "../src/server/storage/studio-db";

const TOKEN = "made-up-page-token";
const OPTIONS = { maxRequests: MAX_REQUESTS, ignorePatterns: [], paused: false };

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/* A log long enough that its replay is read over many turns of the event loop. */
function longLog(): RequestLog {
  const dir = mkdtempSync(join(tmpdir(), "courier-replay-order-"));
  const opened = openStudioDb(dir);
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => opened.close());
  const log = createRequestLog(opened.db);
  for (let n = 0; n < MAX_REQUESTS; n++) {
    const records = Array.from({ length: 42 }, (_, at) => ({ id: `r${n}-${at}`, note: "x" }));
    log.record({ type: "request:start", id: `r${n}`, source: "api", method: "orders" }, "s1");
    log.record({ type: "request:end", requestId: `r${n}`, status: 200, data: { records } }, "s1");
  }
  return log;
}

/* Studio's pages, each replayed the log as it connects; `after` runs in the next turn. */
async function pagesOf(log: RequestLog, after: (pages: Namespace) => void) {
  const http = createServer();
  const io = new Server(http);
  const pages = io.of("/ui");
  guardPageBroadcasts(pages);
  pages.on("connection", (socket) => {
    admitPage(socket, socket.handshake.auth.token === TOKEN);
    void replayToPage(socket, "events:replay", log);
    setImmediate(() => after(pages));
  });
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  cleanups.push(() => new Promise<void>((done) => io.close(() => done())));
  return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
}

/* A page, as the UI folds what it is sent: the live events as they come, a replay as it merges one. */
function page(url: string, token?: string) {
  const socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: token === undefined ? {} : { token },
  });
  cleanups.push(() => {
    socket.disconnect();
  });
  const seen = { order: [] as string[], requests: [] as RequestEntry[], live: 0 };
  socket.on("events", (events: RequestEntry[] & Parameters<typeof applyEvents>[1]) => {
    seen.order.push("events");
    seen.live += events.length;
    seen.requests = applyEvents(seen.requests, events, OPTIONS).requests;
  });
  socket.on("events:replay", (payload: Uint8Array) => {
    seen.order.push("events:replay");
    const replayed = applyEvents([], JSON.parse(new TextDecoder().decode(payload)), OPTIONS);
    seen.requests = mergeReplayed(seen.requests, replayed.requests, OPTIONS);
  });
  return seen;
}

const LATE_START = { type: "request:start", id: "late", source: "api", method: "orders" };
const LATE_END = { type: "request:end", requestId: "late", status: 200, data: { ok: true } };

/* What Studio does with an event of a runtime: keeps it, and sends it to the pages open. */
function happens(log: RequestLog, pages: Namespace, event: Record<string, unknown>): void {
  log.record(event, "s1");
  toOpenPages(pages, "events", [event]);
}

const statusOf = (requests: RequestEntry[], id: string) =>
  requests.find((request) => request.id === id)?.status;

/* What one page is sent, on a Studio of its own, as it connects: the replay, and the end of a request
   that began before the page connected, which comes as the replay is read. */
async function connecting(token?: string) {
  const log = longLog();
  log.record(LATE_START, "s1");
  const url = await pagesOf(log, (pages) => happens(log, pages, LATE_END));
  const seen = page(url, token);
  await expect.poll(() => seen.order.length, { timeout: 20_000 }).toBe(2);
  return seen;
}

describe("a page replayed a log as it connects", () => {
  it("is sent what came after it asked behind the replay, without the token as with it", async () => {
    const owner = await connecting(TOKEN);
    const reader = await connecting();

    expect(reader.order).toEqual(owner.order);
    expect(reader.order).toEqual(["events:replay", "events"]);
    expect(statusOf(reader.requests, "late")).toBe("success");
  }, 60_000);

  it("is sent what passed the bound at once, and the replay read again behind it", async () => {
    const log = longLog();
    log.record(LATE_START, "s1");
    const url = await pagesOf(log, (pages) => {
      happens(log, pages, LATE_END);
      for (let n = 0; n < HELD_MESSAGES; n++) {
        toOpenPages(pages, "events", [{ type: "request:start", id: `burst${n}`, source: "api" }]);
      }
    });

    const reader = page(url);
    await expect.poll(() => reader.order.includes("events:replay"), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => reader.live, { timeout: 30_000 }).toBe(HELD_MESSAGES + 1);

    expect(reader.order.at(-1)).toBe("events:replay");
    expect(statusOf(reader.requests, "late")).toBe("success");
  }, 60_000);
});
