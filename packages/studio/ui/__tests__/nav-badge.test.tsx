/**
 * @vitest-environment jsdom
 *
 * The audit score beside the sidebar's Audit link: while requests arrive,
 * the whole audit runs at most once a second, not once per request.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as RunAudit from "@/features/audit/run-audit";
import { useStudioStore } from "@/store";
import { NavBadge } from "../src/shell/sidebar/nav-badge";
import { requestEntry } from "./request-entry-fixture";

const runs = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/features/audit/run-audit", async (actual) => {
  const real = await actual<typeof RunAudit>();
  return {
    runAudit: (...args: Parameters<typeof real.runAudit>) => {
      runs.count += 1;
      return real.runAudit(...args);
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  runs.count = 0;
  useStudioStore.setState({ requests: [requestEntry({ id: "r0" })], scanSources: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the sidebar's audit score", () => {
  it("runs the audit at most once a second while requests arrive", () => {
    render(<NavBadge kind="audit-score" />);
    const before = runs.count;

    for (let i = 1; i <= 5; i++) {
      act(() => {
        useStudioStore.setState((s) => ({
          requests: [requestEntry({ id: `r${i}`, startedAt: 1_000_000 + i }), ...s.requests],
        }));
        vi.advanceTimersByTime(100);
      });
    }
    const duringBurst = runs.count - before;
    act(() => vi.advanceTimersByTime(1_000));

    expect(duringBurst).toBe(0);
    expect(runs.count - before).toBe(1);
  });
});
