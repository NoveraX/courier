/**
 * @vitest-environment jsdom
 *
 * The size of an element, kept current: measured as soon as the element
 * exists, followed as it resizes, and no longer watched once it is gone.
 */
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElementSize } from "@/hooks/use-element-size";

/* Every observer the page made, so a test can report a resize to it. */
const observers: { report: (width: number, height: number) => void; disconnected: boolean }[] = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(): void {
        const record = {
          disconnected: false,
          report: (width: number, height: number) =>
            this.#callback(
              [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            ),
        };
        observers.push(record);
        this.disconnect = () => {
          record.disconnected = true;
        };
      }
      disconnect(): void {}
      unobserve(): void {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe(): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(ref);
  return (
    <>
      <output>{`${width}x${height}`}</output>
      <div ref={ref} />
    </>
  );
}

describe("useElementSize", () => {
  it("is the element's size as it resizes, rounded to whole pixels", () => {
    const view = render(<Probe />);
    const shown = () => view.container.querySelector("output")?.textContent;

    expect(observers).toHaveLength(1);
    act(() => observers[0]?.report(375.4, 612.6));
    expect(shown()).toBe("375x613");
    act(() => observers[0]?.report(844, 300));
    expect(shown()).toBe("844x300");
  });

  it("stops watching the element once the component is gone", () => {
    const view = render(<Probe />);

    expect(observers).toHaveLength(1);
    view.unmount();
    expect(observers[0]?.disconnected).toBe(true);
  });
});
