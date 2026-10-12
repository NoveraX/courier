/**
 * @vitest-environment jsdom
 *
 * Whether a media query matches, kept up to date, and never matching where
 * the page has no `matchMedia` — so a view keeps its desktop layout there.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/hooks/use-media-query";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* A media query list whose answer a test changes, telling its listeners. */
function fakeMatchMedia(initial: boolean): { set: (next: boolean) => void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe("useMediaQuery", () => {
  it("matches nothing where the page has no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => useMediaQuery("(max-width: 639px)"));

    expect(result.current).toBe(false);
  });

  it("answers as the query does now, and again when it changes", () => {
    const media = fakeMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 639px)"));
    expect(result.current).toBe(true);

    act(() => media.set(false));

    expect(result.current).toBe(false);
  });
});
