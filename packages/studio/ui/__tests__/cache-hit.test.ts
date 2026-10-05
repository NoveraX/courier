/**
 * @vitest-environment jsdom
 *
 * A request the cache middleware answered is recorded as served from the
 * cache, with the age of the answer — what the inspector's checks say —
 * not as any other 200 with a fetch time of 0µs; a miss is recorded as
 * fetched.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { requestChecks } from "@/features/requests/request-checks";
import type { StudioEvent } from "@/store";
import { useStudioStore } from "@/store";

type Event = StudioEvent & Record<string, unknown>;

function event(type: string, fields: Record<string, unknown>): Event {
  return {
    id: "r1",
    type: type as Event["type"],
    timestamp: 1,
    sessionId: "s",
    requestId: "r1",
    ...fields,
  };
}

const entry = () => useStudioStore.getState().requests.find((r) => r.id === "r1");

beforeEach(() => {
  useStudioStore.setState({ requests: [], paused: false });
});

describe("a request the cache answered", () => {
  beforeEach(() => {
    useStudioStore.getState().handleEvents([
      event("request:start", { source: "api", group: "cached", method: "config" }),
      event("cache:hit", { key: "public api cached config", age: 12_000 }),
      event("request:end", {
        status: 200,
        timing: { total: 1, middleware: 1, fetch: 0, validation: 0 },
      }),
    ]);
  });

  it("is marked as served from the cache, with the age of the answer", () => {
    const request = entry();

    expect(request?.cache).toEqual({ hit: true, age: 12_000 });
    expect(request && requestChecks(request).at(-1)?.detail).toBe(
      "Served from the cache, stored 12.00s before",
    );
  });
});

describe("a request the cache missed", () => {
  it("is marked as fetched", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", { source: "api", group: "cached", method: "config" }),
        event("cache:miss", { key: "public api cached config" }),
      ]);

    expect(entry()?.cache).toEqual({ hit: false });
  });
});
