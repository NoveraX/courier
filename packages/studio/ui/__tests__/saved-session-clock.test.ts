/**
 * @vitest-environment jsdom
 *
 * A saved session is read against the moment it ended, not the clock: a
 * call still in flight when it was saved reads unfinished instead of
 * counting up for days, and a stream open then shows how long it had been
 * open — while the live requests keep counting as they always did.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { statCellsOf } from "@/features/requests/stat-cells";
import { sessionEnd } from "@/features/sessions/shown-now";
import { useSessionEnd } from "@/features/sessions/use-session-end";
import { durationOf } from "@/screens/timeline/row-values";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const DAY = 86_400_000;
const finished = requestEntry({
  id: "a",
  startedAt: 1_000,
  timing: { total: 250, middleware: 0, fetch: 250, validation: 0 },
});
const inFlight = requestEntry({ id: "b", startedAt: 1_100, status: "pending", timing: undefined });
const stream = requestEntry({
  id: "c",
  startedAt: 1_000,
  transport: "sse",
  streamStatus: "streaming",
  status: "success",
});

beforeEach(() => {
  useStudioStore.setState({ requests: [finished, inFlight], shownSession: null });
});

describe("a saved session's end", () => {
  it("is when its last call finished, and no end while the live requests show", () => {
    const { result, rerender } = renderHook(() => useSessionEnd());
    const live = result.current;
    useStudioStore.setState({ shownSession: { id: "s1", name: "Saved" } });
    rerender();

    expect(sessionEnd([finished, inFlight])).toBe(1_250);
    expect(live).toBeUndefined();
    expect(result.current).toBe(1_250);
  });
});

describe("a call unfinished when its session was saved", () => {
  const context = { now: 1_250 + DAY, slowMs: 500, timestamps: "relative", wide: true } as const;

  it("reads unfinished in a saved session, and counts up among the live requests", () => {
    expect(durationOf(inFlight, "pending", { ...context, endedAt: 1_250 }).text).toBe("unfinished");
    expect(durationOf(inFlight, "pending", context).text).not.toBe("unfinished");
  });

  it("shows a stream open when saved by how long it had been open, not live", () => {
    const saved = durationOf(stream, "streaming", { ...context, endedAt: 1_250 });
    const live = durationOf(stream, "streaming", context);

    expect(saved.text).toBe("250ms");
    expect(live.text.startsWith("live ")).toBe(true);
    expect(
      statCellsOf(stream, { now: context.now, endedAt: 1_250, slowMs: 500, p95: null })[1],
    ).toMatchObject({ value: "250ms", sub: "open when saved" });
  });
});
