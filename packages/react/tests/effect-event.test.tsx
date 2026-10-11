/**
 * @vitest-environment jsdom
 */

/**
 * What a hook's own callbacks call is what the component last committed:
 * React's `useEffectEvent` where React has it, and the same, kept up to date
 * as each render commits, where it does not — never written as it renders.
 */
import { renderHook } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { useEffectEvent, useEffectEventFallback, useLatest } from "../src/hooks/effect-event";

describe("an effect event", () => {
  it("is React's own, where React has one", () => {
    expect(useEffectEvent).toBe(Reflect.get(React, "useEffectEvent"));
  });
});

describe("an effect event where React has none", () => {
  it("calls the function of the render last committed", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useEffectEventFallback(callback), {
      initialProps: { callback: first },
    });

    rerender({ callback: second });
    result.current("tick");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("tick");
  });

  it("is the same function on every render", () => {
    const { result, rerender } = renderHook(({ callback }) => useEffectEventFallback(callback), {
      initialProps: { callback: (): number => 1 },
    });
    const before = result.current;

    rerender({ callback: () => 2 });

    expect(result.current).toBe(before);
    expect(result.current()).toBe(2);
  });
});

describe("the latest value", () => {
  it("is the one the last committed render had", () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: "first" },
    });

    rerender({ value: "second" });

    expect(result.current.current).toBe("second");
  });
});
