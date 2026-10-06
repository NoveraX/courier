/**
 * A page that connects is sent the newest requests of each log, each
 * whole, as many as fit the replay: a log of large events once made the
 * replay hundreds of megabytes, and the page's connection broke there.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createRequestLog } from "../../src/server/request-log";
import { createMockLog } from "../../src/server/storage/mock-log";
import { openStudioDb } from "../../src/server/storage/studio-db";
import { openStudioStores } from "../../src/server/storage/studio-stores";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function studio() {
  const dir = mkdtempSync(join(tmpdir(), "courier-replay-"));
  const db = openStudioDb(dir);
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => db.close());
  return db.db;
}

const padding = "x".repeat(1000);

describe("the request log's replay", () => {
  it("is the newest requests that fit, each whole, oldest first", () => {
    const log = createRequestLog(studio(), 5000);
    for (const id of ["r1", "r2", "r3", "r4"]) {
      log.record({ type: "request:start", id, source: "api", method: "list", padding }, "s1");
      log.record({ type: "request:end", requestId: id, status: 200, padding }, "s1");
    }

    const ids = log.events().map((event) => event.id ?? event.requestId);

    expect(ids).toEqual(["r3", "r3", "r4", "r4"]);
    log.close();
  });
});

describe("the mock log's replay", () => {
  it("is the newest requests that fit, each whole, oldest first", () => {
    const log = createMockLog(studio(), 5000);
    for (const id of ["m1", "m2", "m3", "m4"]) {
      log.record({ type: "mock:request:start", requestId: id, serverId: "shop", padding });
      log.record({ type: "mock:request:end", requestId: id, serverId: "shop", padding });
    }

    const ids = log.events().map((event) => [event.type, event.requestId]);

    expect(ids).toEqual([
      ["mock:request:start", "m3"],
      ["mock:request:end", "m3"],
      ["mock:request:start", "m4"],
      ["mock:request:end", "m4"],
    ]);
    log.close();
  });
});

describe("the stores Studio opens with a replay budget of its own", () => {
  it("send each page no more of either log than the budget, as a public demo does", () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-replay-"));
    const stores = openStudioStores(dir, 5000);
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    cleanups.push(() => stores.close());
    for (const id of ["r1", "r2", "r3", "r4"]) {
      stores.requestLog.record(
        { type: "request:start", id, source: "api", method: "list", padding },
        "s1",
      );
      stores.requestLog.record({ type: "request:end", requestId: id, status: 200, padding }, "s1");
      stores.mockLog.record({
        type: "mock:request:start",
        requestId: id,
        serverId: "shop",
        padding,
      });
      stores.mockLog.record({ type: "mock:request:end", requestId: id, serverId: "shop", padding });
    }

    expect(stores.requestLog.events()).toHaveLength(4);
    expect(stores.mockLog.events()).toHaveLength(4);
  });
});
