/**
 * The requests Studio's mocks answered outlive Studio, as the requests it
 * captured do: a mock's log was the page's alone, and a reload emptied it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMockLog } from "../../src/server/storage/mock-log";
import { openStudioDb } from "../../src/server/storage/studio-db";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-mock-log-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(root: string) {
  const studio = openStudioDb(root);
  const log = createMockLog(studio.db);
  const stop = () => {
    log.close();
    studio.close();
  };
  cleanups.push(stop);
  return { log, stop };
}

const start = (id: string) => ({ type: "mock:request:start", requestId: id, serverId: "petstore", path: "/pets" });
const end = (id: string) => ({ type: "mock:request:end", requestId: id, serverId: "petstore", status: 200 });

describe("the mocks' request logs", () => {
  it("outlive the Studio that kept them", () => {
    const root = project();
    const first = run(root);
    first.log.record(start("req_1"));
    first.log.record(end("req_1"));
    first.stop();

    const second = run(root);

    expect(second.log.events()).toEqual([start("req_1"), end("req_1")]);
  });

  it("keep no credential a request to a mock sent", () => {
    const root = project();
    const first = run(root);
    first.log.record({ ...start("req_1"), headers: { cookie: "sid=1", accept: "json" } });
    first.stop();

    const [kept] = run(root).log.events();

    expect(kept?.headers).toEqual({ cookie: "[redacted]", accept: "json" });
  });

  it("keep the latest 500 requests", () => {
    const { log } = run(project());

    for (let n = 1; n <= 501; n++) log.record(start(`req_${n}`));

    const ids = log.events().map((event) => event.requestId);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe("req_2");
  });

  it("keep only a log's events, and no end of a request they never saw start", () => {
    const { log } = run(project());

    log.record({ type: "mock:store:snapshot", serverId: "petstore", collections: [] });
    log.record(end("req_9"));

    expect(log.events()).toEqual([]);
  });
});
