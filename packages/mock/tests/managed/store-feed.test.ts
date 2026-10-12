/**
 * @vitest-environment node
 */
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreFeed } from "../../src/managed/store-feed";
import type { ChildMessage } from "../../src/managed/types";
import { createMockStore, type MockStore } from "../../src/store";

let sent: ChildMessage[];
let store: MockStore;

function reports(): Array<Record<string, unknown>> {
  return sent.flatMap((m) =>
    m.type === "events" ? m.events.filter((event) => event.type === "mock:store:changes") : [],
  );
}

/* Events leave the worker together once the turn that reported them is over. */
function turnOver(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  sent = [];
  process.send = (message: ChildMessage): boolean => {
    sent.push(message);
    return true;
  };
  store = createMockStore();
  store.collection("users").seed([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(process, "send");
});

describe("createStoreFeed", () => {
  it("starts from the store whole", () => {
    const feed = createStoreFeed(store);

    expect(feed.start()).toEqual([
      { name: "users", count: 3, records: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    ]);
  });

  it("reports a burst of writes once, a tenth of a second after the first", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    for (let id = 4; id < 54; id++) {
      store.collection("users").create({ id });
      feed.changed();
    }

    vi.advanceTimersByTime(99);
    await turnOver();
    expect(reports()).toEqual([]);
    vi.advanceTimersByTime(1);
    await turnOver();

    expect(reports()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({ seq: 1, whole: false, removed: [] });
    expect(reports()[0]?.collections).toEqual([
      {
        name: "users",
        count: 53,
        edits: {
          removed: [],
          changed: [],
          added: Array.from({ length: 50 }, (_, index) => ({ id: index + 4 })),
        },
      },
    ]);
  });

  it("sends no report when the writes left the store as it was", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    store.collection("users").create({ id: 4 });
    store.collection("users").deleteById(4);
    feed.changed();

    vi.advanceTimersByTime(1000);
    await turnOver();

    expect(reports()).toEqual([]);
  });

  it("reports at once when flushed, and numbers each report after the one before", async () => {
    const feed = createStoreFeed(store);
    feed.start();

    store.collection("users").updateById(2, { name: "Ada" });
    feed.flush();
    store.collection("users").deleteById(1);
    feed.flush();
    await turnOver();

    expect(reports().map((report) => report.seq)).toEqual([1, 2]);
    expect(reports()[1]?.collections).toEqual([
      { name: "users", count: 2, edits: { removed: [0], changed: [], added: [] } },
    ]);
  });

  it("numbers reports from one again once it starts again", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    store.collection("users").create({ id: 4 });
    feed.flush();

    feed.start();
    store.collection("users").create({ id: 5 });
    feed.flush();
    await turnOver();

    expect(reports().map((report) => report.seq)).toEqual([1, 1]);
  });

  it("resends every collection whole, changed or not", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    store.collection("posts").create({ id: 9 });

    feed.resend();
    await turnOver();

    expect(reports()).toEqual([
      {
        type: "mock:store:changes",
        seq: 1,
        whole: true,
        collections: [
          { name: "users", count: 3, records: [{ id: 1 }, { id: 2 }, { id: 3 }] },
          { name: "posts", count: 1, records: [{ id: 9 }] },
        ],
        removed: [],
      },
    ]);
  });

  it("reports a collection the store no longer lists as gone", async () => {
    const names = ["users", "posts"];
    const listed: MockStore = { ...store, list: () => [...names] };
    store.collection("posts");
    const feed = createStoreFeed(listed);
    feed.start();

    names.pop();
    feed.flush();
    await turnOver();

    expect(reports()[0]).toMatchObject({ collections: [], removed: ["posts"] });
  });

  it("waits five times as long as working out its last report took", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(0).mockReturnValueOnce(80);
    store.collection("users").create({ id: 4 });
    feed.flush();
    now.mockRestore();

    store.collection("users").create({ id: 5 });
    feed.changed();
    vi.advanceTimersByTime(399);
    await turnOver();
    expect(reports()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await turnOver();

    expect(reports()).toHaveLength(2);
  });

  it("tells Studio once when a record cannot be sent, and reports again once it can", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    store.collection("users").updateById(1, { size: 10n });

    feed.flush();
    feed.flush();
    store.collection("users").updateById(1, { size: 10 });
    feed.flush();
    await turnOver();

    const errors = sent.filter((m) => m.type === "error");
    expect(errors).toEqual([
      {
        type: "error",
        message: expect.stringContaining("The store's changes could not be sent to Studio"),
        fatal: false,
      },
    ]);
    expect(reports()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({ seq: 1 });
  });

  it("reports what changed since the last report as it closes, and nothing after", async () => {
    const feed = createStoreFeed(store);
    feed.start();
    store.collection("users").create({ id: 4 });
    feed.changed();

    feed.close();
    vi.advanceTimersByTime(1000);
    await turnOver();

    expect(reports()).toHaveLength(1);
  });
});
