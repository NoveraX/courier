/**
 * @vitest-environment jsdom
 *
 * The Explorer lists the latest calls first, as the store holds them: the
 * Overview's activity feed, and an endpoint's Requests tab.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RequestEntry } from "@/store/types";
import { RequestsTab } from "@/views/explorer/detail/tabs/requests-tab";
import { computeActivityFeed } from "@/views/explorer/overview/compute-activity";

function request(i: number): RequestEntry {
  return {
    id: `r${i}`,
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    status: "success",
    statusCode: 200 + i,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1_000 + i * 100,
    timing: { total: 10, middleware: 0, fetch: 10, validation: 0 },
    sessionId: "s",
  };
}

/* Newest first, as the store holds them. */
const CAPTURED = Array.from({ length: 60 }, (_, i) => request(i)).reverse();

afterEach(cleanup);

describe("the Overview's activity feed", () => {
  it("lists the latest calls, newest first", () => {
    const feed = computeActivityFeed(CAPTURED);

    expect(feed).toHaveLength(50);
    expect(feed[0]?.id).toBe("r59");
    expect(feed.at(-1)?.id).toBe("r10");
  });
});

describe("an endpoint's Requests tab", () => {
  it("lists its calls in the order given, newest first", () => {
    render(<RequestsTab requests={CAPTURED.slice(0, 3)} />);

    const codes = screen.getAllByRole("button").map((row) => row.textContent?.match(/2\d\d/)?.[0]);
    expect(codes).toEqual(["259", "258", "257"]);
  });
});
