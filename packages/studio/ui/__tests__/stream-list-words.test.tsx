/**
 * @vitest-environment jsdom
 *
 * The lists that call a live stream `live` — an endpoint's latest calls,
 * the Explorer's activity, the Waterfall — say `···` while its first
 * connection is being opened, as for a request in flight, and `retrying`
 * while one is being opened again, both in the warning's colour.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recentCallsOf } from "@/features/requests/recent-calls";
import { matchesFilter, OPEN_FILTER } from "@/features/requests/timeline-filter";
import { timeWindowOf, trackScaleOf } from "@/features/waterfall/time-window";
import { CallRow } from "@/request-list/call-row";
import { ActivityFeed } from "@/screens/explorer/activity-feed";
import { RequestRow } from "@/screens/timeline/request-row";
import { StackedRequestRow } from "@/screens/timeline/request-row-stacked";
import { codeTone, type RowContext } from "@/screens/timeline/row-values";
import { StreamBarRow } from "@/screens/waterfall/stream-bar-row";
import type { RequestEntry, StreamConnection } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

afterEach(cleanup);

function live(connection?: StreamConnection): RequestEntry {
  return requestEntry({
    transport: "sse",
    status: "pending",
    streamStatus: "streaming",
    statusCode: undefined,
    startedAt: 1_000,
    ...(connection && { streamConnection: connection }),
  });
}

const RETRYING = live({ status: "reconnecting", since: 1_500, openedBefore: false, failures: 2 });
const OPENING = live({ status: "connecting", since: 1_000, openedBefore: false });

function wordIn(row: HTMLElement, word: string): HTMLElement {
  const found = Array.from(row.querySelectorAll("span")).find((span) => span.textContent === word);
  if (!found) throw new Error(`"${word}" is not in the row`);
  return found;
}

describe("a live stream in a list", () => {
  it("is retrying in an endpoint's latest calls, and live while its connection is open", () => {
    render(
      <div>
        {recentCallsOf([RETRYING, { ...live(), id: "r2" }], 2).map((call) => (
          <CallRow key={call.request.id} call={call} slowMs={500} onOpen={vi.fn()} />
        ))}
      </div>,
    );

    const [retrying, open] = screen.getAllByRole("button");
    if (!retrying || !open) throw new Error("the calls were not listed");
    expect(wordIn(retrying, "retrying").className).toContain("text-warn");
    expect(wordIn(open, "live").className).toContain("text-brand");
  });

  it("waits in the Explorer's activity while its first connection is being opened", () => {
    render(<ActivityFeed requests={[OPENING]} now={2_000} slowMs={500} live onOpen={vi.fn()} />);

    expect(wordIn(screen.getByRole("button"), "···").className).toContain("text-warn");
  });

  it("is retrying in the Waterfall", () => {
    const window = timeWindowOf([{ start: 1_000, end: 3_000 }], 3_000);

    render(
      <StreamBarRow
        request={RETRYING}
        window={window}
        scale={trackScaleOf(window, 600)}
        labelPx={300}
        layout="columns"
        now={3_000}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(wordIn(screen.getByRole("button"), "retrying").className).toContain("text-warn");
  });

  it("is told reconnecting to a screen reader in either Timeline row, and found so by the search", () => {
    const context: RowContext = { now: 3_000, slowMs: 500, timestamps: "relative", wide: true };

    render(<RequestRow request={RETRYING} selected={false} context={context} onSelect={vi.fn()} />);
    render(
      <StackedRequestRow
        request={RETRYING}
        selected={false}
        context={context}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Reconnecting")).toHaveLength(2);
    expect(
      matchesFilter(RETRYING, { ...OPEN_FILTER, search: "reconnecting" }, { slowMs: 500 }),
    ).toBe(true);
    expect(matchesFilter(live(), { ...OPEN_FILTER, search: "reconnecting" }, { slowMs: 500 })).toBe(
      false,
    );
  });

  it("has its kind told in the warning's colour in the Timeline", () => {
    expect(codeTone(RETRYING, "streaming")).toBe("text-warn");
    expect(codeTone(live(), "streaming")).toBe("text-brand");
  });
});
