/**
 * @vitest-environment jsdom
 *
 * The value the sidebar's audit badge computes from: the request list,
 * taken at most once a second while events arrive, the last of a burst
 * taken when the second ends.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThrottledValue } from "../src/hooks/use-throttled-value";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useThrottledValue", () => {
  it("takes a change after a quiet interval at once", () => {
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 1_000), {
      initialProps: { value: 1 },
    });
    act(() => vi.advanceTimersByTime(1_500));

    rerender({ value: 2 });

    expect(result.current).toBe(2);
  });

  it("takes a burst of changes as its last one, once the interval ends", () => {
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 1_000), {
      initialProps: { value: 1 },
    });

    for (const value of [2, 3, 4]) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(100));
    }
    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(4);
  });
});
