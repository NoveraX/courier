/**
 * The page's copy of a mock's store follows the mock's reports of it, each
 * applied to the store as the one before left it. A page holds a mock's
 * records only once it asked for them, to show them: before, and once a
 * report does not fit the records it holds, it holds each collection's
 * count, and asks Studio for the records when it shows them — never the
 * mock, which would send them to every page.
 */
import type { Socket } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindEvents } from "../src/socket/event-bindings";
import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const ADA = { id: 1, name: "Ada" };
const LIN = { id: 2, name: "Lin" };

function connect(collections: unknown, fields: Record<string, unknown> = {}): void {
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "shop",
    name: "shop",
    processStatus: "running",
    collections,
    storeSeq: 4,
    startedAt: 1_000,
    ...fields,
  });
}

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  connect([{ name: "users", count: 1, records: [ADA] }]);
});

function report(seq: number, fields: Record<string, unknown> = {}) {
  return {
    type: "mock:store:changes",
    serverId: "shop",
    seq,
    whole: false,
    collections: [{ name: "users", count: 2, edits: { removed: [], changed: [], added: [LIN] } }],
    removed: [],
    ...fields,
  };
}

const shop = () => useMockStore.getState().servers.shop;

describe("a mock's store on a page that holds its records", () => {
  it("takes each report that follows the one before", () => {
    handleMockEvent(report(5));

    expect(shop()).toMatchObject({
      storeSeq: 5,
      recordCount: 2,
      recordsLoaded: true,
      collections: [{ name: "users", count: 2, records: [ADA, LIN] }],
    });
  });

  it("passes over a report older than its copy", () => {
    handleMockEvent(report(3));

    expect(shop()).toMatchObject({
      storeSeq: 4,
      recordsLoaded: true,
      collections: [{ count: 1, records: [ADA] }],
    });
  });

  it("holds the counts alone when a report is missing", () => {
    handleMockEvent(report(6));

    expect(shop()).toMatchObject({
      storeSeq: 6,
      recordCount: 2,
      recordsLoaded: false,
      collections: [{ name: "users", count: 2, records: [] }],
    });
  });

  it("holds the counts alone when a report's edits do not fit its records", () => {
    const edits = { removed: [3], changed: [], added: [] };

    handleMockEvent(report(5, { collections: [{ name: "users", count: 0, edits }] }));

    expect(shop()).toMatchObject({
      storeSeq: 5,
      recordsLoaded: false,
      collections: [{ name: "users", count: 0, records: [] }],
    });
  });

  it("takes the store whole, whatever its number", () => {
    const whole = { whole: true, collections: [{ name: "users", count: 1, records: [LIN] }] };

    handleMockEvent(report(1, whole));

    expect(shop()).toMatchObject({
      storeSeq: 1,
      recordsLoaded: true,
      collections: [{ records: [LIN] }],
    });
  });
});

describe("a mock's store on a page that has not shown its records", () => {
  beforeEach(() => {
    connect(
      [
        { name: "users", count: 1 },
        { name: "posts", count: 3 },
      ],
      { startedAt: 2_000 },
    );
  });

  it("holds each collection's count, and no record", () => {
    expect(shop()).toMatchObject({
      recordsLoaded: false,
      collections: [
        { name: "users", count: 1, records: [] },
        { name: "posts", count: 3, records: [] },
      ],
    });
  });

  it("takes each report's counts: a collection changed, one gone, one new", () => {
    const tags = { name: "tags", count: 2, records: [{ id: "t1" }, { id: "t2" }] };

    handleMockEvent(
      report(5, { collections: [report(5).collections[0], tags], removed: ["posts"] }),
    );

    expect(shop()).toMatchObject({
      storeSeq: 5,
      recordCount: 4,
      recordsLoaded: false,
      collections: [
        { name: "users", count: 2, records: [] },
        { name: "tags", count: 2, records: [] },
      ],
    });
  });

  it("takes the counts of a report that skips one, as they are the mock's", () => {
    handleMockEvent(report(9));

    expect(shop()).toMatchObject({
      storeSeq: 9,
      collections: [{ count: 2 }, { count: 3 }],
    });
  });

  it("passes over a report older than the counts it holds", () => {
    handleMockEvent(report(4));

    expect(shop()).toMatchObject({ storeSeq: 4, collections: [{ count: 1 }, { count: 3 }] });
  });

  it("takes a whole store's counts, not its records, and drops a collection it leaves out", () => {
    const whole = { whole: true, collections: [{ name: "users", count: 1, records: [LIN] }] };

    handleMockEvent(report(1, whole));

    expect(shop()?.collections).toEqual([{ name: "users", count: 1, records: [] }]);
    expect(shop()).toMatchObject({ storeSeq: 1, recordsLoaded: false });
  });
});

describe("a mock's state, as Studio sends it again", () => {
  it("keeps the records the page holds while the store is the same", () => {
    connect([{ name: "users", count: 1 }]);

    expect(shop()).toMatchObject({
      recordsLoaded: true,
      collections: [{ name: "users", count: 1, records: [ADA] }],
    });
  });

  it("holds the counts alone once the mock started again", () => {
    connect([{ name: "users", count: 1 }], { startedAt: 5_000, storeSeq: 0 });

    expect(shop()).toMatchObject({
      recordsLoaded: false,
      storeSeq: 0,
      collections: [{ name: "users", count: 1, records: [] }],
    });
  });

  it("holds the counts alone when the page missed a report of the store", () => {
    connect([{ name: "users", count: 2 }], { storeSeq: 5 });

    expect(shop()).toMatchObject({
      recordsLoaded: false,
      storeSeq: 5,
      collections: [{ name: "users", count: 2, records: [] }],
    });
  });

  it("keeps the store as it was when the state brings none", () => {
    connect(undefined);

    expect(shop()).toMatchObject({
      recordsLoaded: true,
      storeSeq: 4,
      collections: [{ records: [ADA] }],
    });
  });

  it("needs no records of a mock that keeps no data", () => {
    connect([], { startedAt: 7_000, storeSeq: 0 });

    expect(shop()).toMatchObject({ recordsLoaded: true, collections: [] });
  });
});

describe("a page's live events", () => {
  it("ask nothing of anyone when a report does not fit the records", () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const emit = vi.fn();
    const socket = {
      on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler),
      off: vi.fn(),
      emit,
      timeout: () => ({ emit }),
    } as unknown as Socket;
    const store = {
      handleEvents: vi.fn(),
      replayEvents: vi.fn(),
      showSession: vi.fn(),
      shownSession: null,
      showLive: vi.fn(),
      setReceived: vi.fn(),
    };
    bindEvents(socket, () => store);
    const live = { id: "e1", timestamp: 1, sessionId: "mock-manager" };

    handlers.get("events")?.([{ ...live, ...report(5) }]);
    handlers.get("events")?.([{ ...live, ...report(7) }]);

    expect(shop()).toMatchObject({ storeSeq: 7, recordsLoaded: false });
    expect(emit).not.toHaveBeenCalled();
  });
});
