/**
 * @vitest-environment jsdom
 *
 * The width of an element, kept current: measured as soon as the element
 * exists — on the first render or a later one, once its data has arrived —
 * and followed as it resizes or is replaced.
 */
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElementWidth } from "@/hooks/use-element-width";

/* Every observer the page made, so a test can report a resize to it. */
const observers: { element: Element; report: (width: number) => void; disconnected: boolean }[] =
  [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(element: Element): void {
        const record = {
          element,
          disconnected: false,
          report: (width: number) =>
            this.#callback(
              [{ contentRect: { width } } as unknown as ResizeObserverEntry],
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

function Probe({ ready, width }: { ready: boolean; width: number }): React.ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const measured = useElementWidth(ref, 1200);
  return (
    <>
      <output>{measured}</output>
      {ready && (
        <div
          ref={(node) => {
            ref.current = node;
            if (node)
              Object.defineProperty(node, "clientWidth", { value: width, configurable: true });
          }}
        />
      )}
    </>
  );
}

describe("useElementWidth", () => {
  it("measures an element that appears only after the first render", () => {
    const { container, rerender } = render(<Probe ready={false} width={375} />);
    expect(container.querySelector("output")?.textContent).toBe("1200");

    rerender(<Probe ready width={375} />);

    expect(container.querySelector("output")?.textContent).toBe("375");
    expect(observers).toHaveLength(1);
  });

  it("follows the element as it resizes", () => {
    const { container } = render(<Probe ready width={375} />);
    const [observer] = observers;
    if (!observer) throw new Error("The element was never observed");

    act(() => observer.report(812));

    expect(container.querySelector("output")?.textContent).toBe("812");
  });

  it("stops watching an element that goes away", () => {
    const { rerender } = render(<Probe ready width={375} />);
    const [observer] = observers;
    if (!observer) throw new Error("The element was never observed");

    rerender(<Probe ready={false} width={375} />);

    expect(observer.disconnected).toBe(true);
  });
});
