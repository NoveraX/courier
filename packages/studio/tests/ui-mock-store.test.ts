import type { Socket } from "socket.io";
import { describe, expect, it } from "vitest";

import type { ServerState } from "../src/server/mock-manager/types";
import { bindMockStore } from "../src/server/ui-mock-store";
import { READ_ONLY_VISITORS, READING_EVENTS } from "../src/server/ui-token-guard";

/* A page's socket: the handlers Studio binds on it, called as the page would. */
function pageSocket() {
  const handlers = new Map<string, (raw: unknown, ack?: unknown) => unknown>();
  const socket = {
    on: (event: string, handler: (raw: unknown, ack?: unknown) => unknown) => {
      handlers.set(event, handler);
    },
  };
  const ask = async (raw: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      void handlers.get("mock:store:get")?.(raw, resolve);
    });
  return { socket: socket as unknown as Socket, handlers, ask };
}

const USERS = { name: "users", count: 2, records: [{ id: 1 }, { id: 2 }] };

/* The mocks Studio runs, as the coordinator describes them. */
function mocks(...states: Array<Partial<ServerState>>) {
  return { describeServers: () => states as ServerState[] };
}

describe("a page that asks for a mock's records", () => {
  it("is sent the store Studio holds of the mock, and which store it is", async () => {
    const { socket, ask } = pageSocket();
    bindMockStore(
      socket,
      mocks(
        { serverId: "billing", startedAt: 1, storeSeq: 0, collections: [] },
        { serverId: "shop", startedAt: 1_234, storeSeq: 7, collections: [USERS] },
      ),
    );

    expect(await ask({ serverId: "shop" })).toEqual({
      ok: true,
      serverId: "shop",
      startedAt: 1_234,
      storeSeq: 7,
      collections: [USERS],
    });
  });

  it("is sent the store of a mock that has not started, as of no start", async () => {
    const { socket, ask } = pageSocket();
    bindMockStore(socket, mocks({ serverId: "shop", storeSeq: 0, collections: [] }));

    expect(await ask({ serverId: "shop" })).toMatchObject({
      ok: true,
      startedAt: 0,
      collections: [],
    });
  });

  it("is told why for a mock Studio does not run, or no mock named", async () => {
    const { socket, ask } = pageSocket();
    bindMockStore(socket, mocks({ serverId: "shop", storeSeq: 0, collections: [USERS] }));
    const none = pageSocket();
    bindMockStore(none.socket, undefined);

    expect(await ask({ serverId: "billing" })).toEqual({
      ok: false,
      error: 'Studio runs no mock named "billing".',
    });
    expect(await ask({ serverId: 1 })).toEqual({ ok: false, error: "The page named no mock." });
    expect(await ask("shop")).toEqual({ ok: false, error: "The page named no mock." });
    expect(await none.ask({ serverId: "shop" })).toMatchObject({ ok: false });
  });

  it("that waits for no answer is sent none", () => {
    const { socket, handlers } = pageSocket();
    bindMockStore(socket, mocks({ serverId: "shop", storeSeq: 0, collections: [USERS] }));

    expect(() => handlers.get("mock:store:get")?.({ serverId: "shop" })).not.toThrow();
  });

  it("reads, so a page without Studio's token may ask too", () => {
    const visitor = { page: "page-1", address: "127.0.0.1" };

    expect(READING_EVENTS.has("mock:store:get")).toBe(true);
    expect(READ_ONLY_VISITORS.decide(visitor, "mock:store:get", [{ serverId: "shop" }])).toEqual({
      kind: "run",
    });
  });
});
