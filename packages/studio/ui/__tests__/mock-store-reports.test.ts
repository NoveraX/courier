/**
 * The page's copy of a mock's store follows the mock's reports of it, each
 * applied to the store as the one before left it; when one is missing, or
 * does not fit, the page asks the mock for its store whole, once.
 */
import type { Socket } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindEvents } from "../src/socket/event-bindings";
import { storeResender } from "../src/socket/store-resender";
import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const ADA = { id: 1, name: "Ada" };
const LIN = { id: 2, name: "Lin" };

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "shop",
    name: "shop",
    processStatus: "running",
    collections: [{ name: "users", count: 1, records: [ADA] }],
    storeSeq: 4,
  });
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

/* A socket that keeps what the page emits, with each emit's answer. */
function fakeSocket() {
  const handlers = new Map<string, (data: unknown) => void>();
  const emitted: Array<{ event: string; payload: unknown; answer: () => void }> = [];
  const socket = {
    on: (event: string, handler: (data: unknown) => void) => handlers.set(event, handler),
    off: vi.fn(),
    timeout: () => ({
      emit: (event: string, payload: unknown, answer: () => void) =>
        emitted.push({ event, payload, answer }),
    }),
  };
  return { socket: socket as unknown as Socket, handlers, emitted };
}

describe("a mock's store on the page", () => {
  it("takes each report that follows the one before", () => {
    expect(handleMockEvent(report(5))).toBe(true);

    expect(shop()).toMatchObject({
      storeSeq: 5,
      recordCount: 2,
      collections: [{ name: "users", count: 2, records: [ADA, LIN] }],
    });
  });

  it("passes over a report older than its copy", () => {
    expect(handleMockEvent(report(3))).toBe(true);

    expect(shop()).toMatchObject({ storeSeq: 4, collections: [{ count: 1 }] });
  });

  it("falls out of step when a report is missing, and keeps its copy", () => {
    expect(handleMockEvent(report(6))).toBe(false);

    expect(shop()).toMatchObject({ storeSeq: 4, collections: [{ count: 1 }] });
  });

  it("falls out of step when a report's edits do not fit its copy", () => {
    const edits = { removed: [3], changed: [], added: [] };

    expect(handleMockEvent(report(5, { collections: [{ name: "users", count: 0, edits }] }))).toBe(
      false,
    );
    expect(shop()?.storeSeq).toBe(4);
  });

  it("takes the store whole, whatever its number", () => {
    const whole = { whole: true, collections: [{ name: "users", count: 1, records: [LIN] }] };

    expect(handleMockEvent(report(1, whole))).toBe(true);

    expect(shop()).toMatchObject({ storeSeq: 1, collections: [{ records: [LIN] }] });
  });
});

describe("asking a mock for its store whole", () => {
  it("asks each mock once until it answers", () => {
    const { socket, emitted } = fakeSocket();
    const askForStore = storeResender(socket);

    askForStore("shop");
    askForStore("shop");
    askForStore("billing");
    emitted[0]?.answer();
    askForStore("shop");

    expect(emitted.map(({ event, payload }) => [event, payload])).toEqual([
      ["mock:command", { action: "mock:store:resend", serverId: "shop" }],
      ["mock:command", { action: "mock:store:resend", serverId: "billing" }],
      ["mock:command", { action: "mock:store:resend", serverId: "shop" }],
    ]);
  });

  it("is what the page does with a live report it cannot take", () => {
    const { socket, handlers, emitted } = fakeSocket();
    const store = { handleEvents: vi.fn(), replayEvents: vi.fn(), showSession: vi.fn() };
    bindEvents(socket, () => store);
    const live = { id: "e1", timestamp: 1, sessionId: "mock-manager" };

    handlers.get("event")?.({ ...live, ...report(5) });
    handlers.get("event")?.({ ...live, ...report(7) });

    expect(shop()?.storeSeq).toBe(5);
    expect(emitted.map(({ payload }) => payload)).toEqual([
      { action: "mock:store:resend", serverId: "shop" },
    ]);
  });
});
