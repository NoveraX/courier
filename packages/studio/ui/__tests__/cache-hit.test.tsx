/**
 * @vitest-environment jsdom
 */
/**
 * A request the cache middleware answered is shown as served from the
 * cache, not as any other 200 with a fetch time of 0µs.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GeneralTab } from "@/components/shared/detail-panel/tabs/general-tab";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StudioEvent } from "@/store";
import { useStudioStore } from "@/store";
import { RequestRow } from "@/views/timeline/request-row";

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

afterEach(cleanup);

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
    expect(entry()?.cache).toEqual({ hit: true, age: 12_000 });
  });

  it("says so in its details", () => {
    const request = entry();
    if (!request) throw new Error("the request was not recorded");

    render(<GeneralTab request={request} />);

    expect(screen.getByText("Served from cache, stored 12.00s before")).toBeTruthy();
  });

  it("carries a cache badge in the Timeline", () => {
    const request = entry();
    if (!request) throw new Error("the request was not recorded");

    render(
      <TooltipProvider>
        <RequestRow request={request} selected={false} onSelect={() => {}} />
      </TooltipProvider>,
    );

    expect(screen.getByText("cache")).toBeTruthy();
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
