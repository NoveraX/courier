/**
 * @vitest-environment jsdom
 *
 * A call another call's request answered is set against no p95: in its
 * Timing tab it waited where another call fetches, and says for whose
 * request; its Duration cell names no p95 either. A call that sent its
 * own request is set against its endpoint's.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { statCellsOf } from "@/features/requests/stat-cells";
import { TimingTab } from "@/inspector/tabs/timing-tab";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const timing = (total: number) => ({ total, middleware: 0, fetch: total, validation: 0 });
const sent = requestEntry({ id: "sent", startedAt: 1_000, timing: timing(100) });
const joined = requestEntry({
  id: "joined",
  startedAt: 1_010,
  timing: timing(300),
  shared: { by: "flight", with: "sent" },
});

beforeEach(() => {
  useStudioStore.setState({ requests: [joined, sent] });
});

afterEach(cleanup);

describe("a call another call's request answered, in its Timing tab", () => {
  it("waited, for the request the call that sent it named, and is set against no p95", () => {
    render(<TimingTab request={joined} />);

    expect(screen.getByText("Waited")).toBeTruthy();
    expect(screen.queryByText("Fetch")).toBeNull();
    expect(screen.getByText("Waited for the request api.users.list sent")).toBeTruthy();
    expect(screen.queryByText(/than p95|In line with p95/)).toBeNull();
  });

  it("names no p95 under its duration", () => {
    const [, duration] = statCellsOf(joined, { now: 2_000, slowMs: 500, p95: 100 });

    expect(duration?.sub).toBe("waited for another call");
  });
});

describe("a call that sent its own request, in its Timing tab", () => {
  it("is set against its endpoint's p95", () => {
    render(<TimingTab request={sent} />);

    expect(screen.getByText("Fetch")).toBeTruthy();
    expect(screen.getByText("In line with p95")).toBeTruthy();
  });
});
