/**
 * A page asks Studio for a mock's records when it shows them: once at a
 * time, taking only records of the store it holds the counts of, and
 * keeping why they did not come for the page to show.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = (error: Error | null, reply?: unknown) => void;

const asked = vi.hoisted(() => [] as Array<{ event: string; payload: unknown; answer: Answer }>);

const link = vi.hoisted(() => ({ connected: true }));

vi.mock("@/socket", () => ({
  getSocket: () => ({
    connected: link.connected,
    timeout: () => ({
      emit: (event: string, payload: unknown, answer: Answer) =>
        asked.push({ event, payload, answer }),
    }),
  }),
}));

import { requestMockStore } from "@/mocks/request-mock-store";
import { useMockStore } from "@/store/mock-slice";
import { mockServer } from "./mock-server-fixture";

const ADA = { id: 1, name: "Ada" };

beforeEach(() => {
  asked.length = 0;
  link.connected = true;
  useMockStore.setState({
    servers: {
      shop: mockServer({
        serverId: "shop",
        startedAt: 2_000,
        storeSeq: 4,
        recordsLoaded: false,
        collections: [{ name: "users", count: 1, records: [] }],
      }),
    },
  });
});

const shop = () => useMockStore.getState().servers.shop;

function answer(at: number, reply: unknown, error: Error | null = null): void {
  const each = asked[at];
  expect(each).toBeDefined();
  each?.answer(error, reply);
}

const store = (fields: Record<string, unknown> = {}) => ({
  ok: true,
  serverId: "shop",
  startedAt: 2_000,
  storeSeq: 4,
  collections: [{ name: "users", count: 1, records: [ADA] }],
  ...fields,
});

describe("asking Studio for a mock's records", () => {
  it("asks once at a time for each mock", () => {
    requestMockStore("shop");
    requestMockStore("shop");
    answer(0, store());
    requestMockStore("shop");

    expect(asked.map(({ event, payload }) => [event, payload])).toEqual([
      ["mock:store:get", { serverId: "shop" }],
      ["mock:store:get", { serverId: "shop" }],
    ]);
    answer(1, store());
  });

  it("takes the records of the store the page holds the counts of", () => {
    requestMockStore("shop");
    answer(0, store({ storeSeq: 6, collections: [{ name: "users", count: 1, records: [ADA] }] }));

    expect(shop()).toMatchObject({
      recordsLoaded: true,
      storeSeq: 6,
      collections: [{ name: "users", count: 1, records: [ADA] }],
    });
  });

  it("passes over the records of a store the mock has since replaced", () => {
    requestMockStore("shop");
    answer(0, store({ startedAt: 1_000 }));

    expect(shop()).toMatchObject({ recordsLoaded: false, collections: [{ records: [] }] });
    expect(shop()?.recordsProblem).toBeUndefined();
  });

  it("passes over records behind the reports the page took", () => {
    requestMockStore("shop");
    answer(0, store({ storeSeq: 3 }));

    expect(shop()).toMatchObject({ recordsLoaded: false, storeSeq: 4 });
  });

  it("passes over an answer once the page holds the records", () => {
    requestMockStore("shop");
    useMockStore.getState().setServerCollections("shop", [], 5, true);
    answer(0, store({ storeSeq: 9 }));

    expect(shop()).toMatchObject({ recordsLoaded: true, storeSeq: 5, collections: [] });
  });

  it("keeps why Studio did not send them, and forgets it once they come", () => {
    requestMockStore("shop");
    answer(0, { ok: false, error: 'Studio runs no mock named "shop".' });

    expect(shop()).toMatchObject({
      recordsLoaded: false,
      recordsProblem: 'Studio runs no mock named "shop".',
    });

    requestMockStore("shop");
    answer(1, store());

    expect(shop()).toMatchObject({ recordsLoaded: true });
    expect(shop()?.recordsProblem).toBeUndefined();
  });

  it("keeps that Studio did not answer, and asks again", () => {
    requestMockStore("shop");
    answer(0, undefined, new Error("operation has timed out"));
    requestMockStore("shop");

    expect(shop()?.recordsProblem).toBe("Studio did not answer within 10 s.");
    expect(asked).toHaveLength(2);
    answer(1, store());
  });

  it("asks nothing while the page is not connected to Studio", () => {
    link.connected = false;

    requestMockStore("shop");

    expect(asked).toEqual([]);
  });

  it("keeps that an answer held no records the page could read", () => {
    requestMockStore("shop");
    answer(0, store({ collections: [{ name: "users", count: 1 }] }));

    expect(shop()).toMatchObject({
      recordsLoaded: false,
      recordsProblem: "Studio's answer held no records the page could read.",
    });
  });
});
