/**
 * @vitest-environment jsdom
 *
 * A Playground call `browsersOnly` let through on Studio's one-time pass is
 * marked so: from its start or its stream's opening, in a saved session,
 * on its Timeline row in either layout, and in the inspector's Overview. A
 * call without the mark shows none of it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { requestProperties } from "@/features/requests/request-properties";
import { requestFromSaved } from "@/features/sessions/saved-request";
import { RequestRow } from "@/screens/timeline/request-row";
import { StackedRequestRow } from "@/screens/timeline/request-row-stacked";
import type { RowContext } from "@/screens/timeline/row-values";
import { applyEvents } from "@/store/apply-events";
import { requestEntry } from "./request-entry-fixture";

const OPTIONS = { maxRequests: 100, ignorePatterns: [], paused: false };
const NOW = 2_000_000;

afterEach(cleanup);

function start(id: string, extra: Record<string, unknown> = {}) {
  return {
    type: "request:start" as const,
    id,
    requestId: id,
    sessionId: "s",
    timestamp: 1_000,
    source: "api",
    method: "list",
    mode: "proxy",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    ...extra,
  };
}

describe("a call let through on Studio's pass", () => {
  it("is marked from its start, and a call without the mark is not", () => {
    const { requests } = applyEvents(
      [],
      [start("pg_a", { studioPass: true }), start("b"), start("c", { studioPass: "yes" })],
      OPTIONS,
    );

    expect(requests.find((r) => r.id === "pg_a")?.studioPass).toBe(true);
    expect(requests.find((r) => r.id === "b")?.studioPass).toBeUndefined();
    expect(requests.find((r) => r.id === "c")?.studioPass).toBeUndefined();
  });

  it("is marked from its stream's opening", () => {
    const open = {
      type: "stream:open" as const,
      id: "pg_feed",
      requestId: "pg_feed",
      sessionId: "s",
      timestamp: 1_000,
      source: "api",
      method: "feed",
      transport: "sse",
      mode: "proxy",
      studioPass: true,
    };

    const { requests } = applyEvents([], [open], OPTIONS);

    expect(requests[0]?.studioPass).toBe(true);
  });

  it("keeps its mark in a saved session", () => {
    const saved = { id: "r", source: "api", method: "list", startedAt: 1 };

    expect(requestFromSaved({ ...saved, studioPass: true })?.studioPass).toBe(true);
    expect(requestFromSaved(saved)?.studioPass).toBeUndefined();
  });

  it("carries the chip on its Timeline row, in both layouts", () => {
    const request = requestEntry({ id: "pg_a", startedAt: NOW - 1_000, studioPass: true });
    const context: RowContext = { now: NOW, slowMs: 500, timestamps: "relative", wide: true };

    render(<RequestRow request={request} selected={false} context={context} onSelect={() => {}} />);
    render(
      <StackedRequestRow
        request={request}
        selected={false}
        context={{ ...context, wide: false }}
        onSelect={() => {}}
      />,
    );

    const chips = screen.getAllByText("studio pass");
    expect(chips).toHaveLength(2);
    expect(chips[0]?.getAttribute("title")).toContain(
      "browsersOnly let this Playground call through",
    );
  });

  it("carries no chip without the mark", () => {
    const request = requestEntry({ id: "b", startedAt: NOW - 1_000 });
    const context: RowContext = { now: NOW, slowMs: 500, timestamps: "relative", wide: true };

    render(<RequestRow request={request} selected={false} context={context} onSelect={() => {}} />);

    expect(screen.queryByText("studio pass")).toBeNull();
  });

  it("says so in the Overview", () => {
    const marked = requestProperties(requestEntry({ id: "pg_a", studioPass: true }), {});
    const plain = requestProperties(requestEntry({ id: "b" }), {});

    expect(marked).toContainEqual({
      label: "browsersOnly",
      value: "let through on Studio's one-time pass",
      mono: false,
    });
    expect(plain.some((property) => property.label === "browsersOnly")).toBe(false);
  });
});
