/**
 * What lists of requests are made of — the editor's figures for every
 * endpoint, an agent's list — is kept apart from the events the database
 * holds: each request's start and end, without the bodies and headers they
 * carry, as the requests arrive, after a restart and once a request is let
 * go. One request is read whole from the database by its id.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createRequestLog, MAX_REQUESTS } from "../../src/server/request-log";
import { createRequestOutline } from "../../src/server/request-outline";
import { openStudioDb } from "../../src/server/storage/studio-db";

type Event = Record<string, unknown>;
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function run(root: string) {
  const studio = openStudioDb(root);
  const log = createRequestLog(studio.db);
  const stop = () => {
    log.close();
    studio.close();
  };
  cleanups.push(stop);
  return { log, stop };
}

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-request-outline-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const start = (id: string): Event => ({
  type: "request:start",
  id,
  source: "api",
  method: "list",
  variables: { page: 1 },
});
const middleware = (id: string): Event => ({
  type: "middleware:enter",
  requestId: id,
  name: "auth",
});
const end = (id: string): Event => ({
  type: "request:end",
  requestId: id,
  status: 200,
  timing: { total: 4 },
  data: [{ id: 1 }],
  headers: { "content-type": "application/json" },
  requestHeaders: { accept: "*/*" },
});

describe("the outline of the requests", () => {
  it("holds each request's start and end, without what they sent and were answered with", () => {
    const outline = createRequestOutline([]);

    outline.see("r1", start("r1"));
    outline.see("r1", middleware("r1"));
    outline.see("r1", end("r1"));

    expect(outline.events()).toEqual([
      { type: "request:start", id: "r1", source: "api", method: "list" },
      { type: "request:end", requestId: "r1", status: 200, timing: { total: 4 } },
    ]);
  });

  it("lists the requests in the order they started, each request's events together", () => {
    const outline = createRequestOutline([]);

    outline.see("r1", start("r1"));
    outline.see("r2", start("r2"));
    outline.see("r1", end("r1"));

    expect(outline.events().map((event) => [event.type, event.id ?? event.requestId])).toEqual([
      ["request:start", "r1"],
      ["request:end", "r1"],
      ["request:start", "r2"],
    ]);
  });
});

describe("a request log's key events", () => {
  it("follow the events it keeps, and outlive a restart without their bodies", () => {
    const root = project();
    const first = run(root);
    first.log.record(start("r1"), "socket-1");
    first.log.record(middleware("r1"), "socket-1");
    first.log.record(end("r1"), "socket-1");
    const live = first.log.keyEvents();
    first.stop();

    const second = run(root);

    expect(live).toEqual([
      { type: "request:start", id: "r1", source: "api", method: "list" },
      { type: "request:end", requestId: "r1", status: 200, timing: { total: 4 } },
    ]);
    expect(second.log.keyEvents()).toEqual(live);
  });

  it("hold how a stream's connection stood last, after a restart too", () => {
    const root = project();
    const first = run(root);
    const status = (failures: number): Event => ({
      type: "stream:status",
      requestId: "s1",
      status: "reconnecting",
      failures,
    });
    first.log.record(
      { type: "stream:open", requestId: "s1", source: "api", method: "ticks" },
      "socket-1",
    );
    first.log.record(status(1), "socket-1");
    first.log.record(status(2), "socket-1");
    first.stop();

    const second = run(root);

    expect(second.log.keyEvents().map((event) => [event.type, event.failures])).toEqual([
      ["stream:open", undefined],
      ["stream:status", 2],
      ["stream:error", undefined],
    ]);
  });

  it("let a request go when the log does", () => {
    const { log } = run(project());
    for (let at = 0; at <= MAX_REQUESTS; at++) log.record(start(`r${at}`), "socket-1");

    const ids = log.keyEvents().map((event) => event.id);

    expect(ids).toHaveLength(MAX_REQUESTS);
    expect(ids[0]).toBe("r1");
    expect(log.eventsOf("r0")).toEqual([]);
  });
});

describe("one request's events", () => {
  it("are read whole, in the order they came, for the request named alone", () => {
    const { log } = run(project());
    log.record(start("r1"), "socket-1");
    log.record(start("r2"), "socket-1");
    log.record(middleware("r1"), "socket-1");
    log.record(end("r1"), "socket-1");

    expect(log.eventsOf("r1")).toEqual([start("r1"), middleware("r1"), end("r1")]);
  });
});
