/**
 * The requests Studio has seen outlive Studio: a Studio that restarts shows
 * what the last one was shown, and ends what the last one left open, since
 * no runtime can say any more how those ended.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createRequestLog } from "../../src/server/request-log";
import { RUNTIME_GONE } from "../../src/server/request-log-events";
import { openStudioDb } from "../../src/server/storage/studio-db";

type Event = Record<string, unknown>;
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-request-log-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A Studio run on the project: its log, and how to stop it. */
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

const start = (id: string): Event => ({ type: "request:start", id, source: "api", method: "list" });
const end = (id: string): Event => ({ type: "request:end", requestId: id, status: 200 });

describe("a Studio that restarts", () => {
  it("shows the requests the last one was shown, in order", () => {
    const root = project();
    const first = run(root);
    first.log.record(start("r1"), "socket-1");
    first.log.record(end("r1"), "socket-1");
    first.log.record(start("r2"), "socket-1");
    first.stop();

    const second = run(root);

    expect(second.log.events().map((event) => [event.type, event.id ?? event.requestId])).toEqual([
      ["request:start", "r1"],
      ["request:end", "r1"],
      ["request:start", "r2"],
      ["request:error", "r2"],
    ]);
  });

  it("ends a request the last one left open once, saying why", () => {
    const root = project();
    const first = run(root);
    first.log.record(start("r1"), "socket-1");
    first.stop();
    run(root).stop();

    const third = run(root);

    const ends = third.log.events().filter((event) => event.type === "request:error");
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ requestId: "r1", error: { message: RUNTIME_GONE } });
  });

  it("keeps forgotten what a page cleared", () => {
    const root = project();
    const first = run(root);
    for (const id of ["r1", "r2", "r3"]) first.log.record(start(id), "socket-1");
    first.log.forget(new Set(["r2"]));
    first.stop();

    const second = run(root);

    expect(second.log.events().filter((event) => event.type === "request:start").map((event) => event.id)).toEqual(["r2"]);
  });
});

describe("what the log writes down, and replays to a page that connects", () => {
  it("keeps no credential", () => {
    const root = project();
    const first = run(root);
    first.log.record(start("r1"), "socket-1");
    first.log.record(
      {
        ...end("r1"),
        requestHeaders: { authorization: "Bearer t", accept: "json" },
        headers: { "set-cookie": "sid=1", "content-type": "application/json" },
      },
      "socket-1",
    );
    first.stop();

    const kept = run(root).log.events().find((event) => event.type === "request:end");

    expect(kept?.requestHeaders).toEqual({ authorization: "[redacted]", accept: "json" });
    expect(kept?.headers).toEqual({ "set-cookie": "[redacted]", "content-type": "application/json" });
  });
});

describe("the log", () => {
  it("keeps the latest 2000 requests", () => {
    const { log } = run(project());

    for (let n = 1; n <= 2001; n++) log.record(start(`r${n}`), "socket-1");

    const started = log.events().map((event) => event.id);
    expect(started).toHaveLength(2000);
    expect(started[0]).toBe("r2");
    expect(started.at(-1)).toBe("r2001");
  });
});
