/**
 * @vitest-environment jsdom
 *
 * The box a person scrolls to move an element up and down: the nearest box
 * around it that scrolls that way and holds more than it shows — a frame
 * sized to what it holds, and a box that clips or shows its overflow, are
 * passed by — none where no box scrolls it, and no answer yet while the
 * element is not laid out.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollParentOf } from "@/lib/scroll-parent";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* A box with the heights a browser would measure: jsdom lays nothing out. */
function box(overflowY: string, shown: number, held: number, child: Element): HTMLDivElement {
  const element = document.createElement("div");
  element.style.overflowY = overflowY;
  Object.defineProperty(element, "clientHeight", { value: shown });
  Object.defineProperty(element, "scrollHeight", { value: held });
  element.append(child);
  return element;
}

function laidOut(): void {
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    () => [new DOMRect()] as unknown as DOMRectList,
  );
}

describe("the box that scrolls an element", () => {
  it("is the nearest one that scrolls up and down and holds more than it shows", () => {
    laidOut();
    const rows = document.createElement("div");
    const frame = box("auto", 3_000, 3_000, rows);
    const pane = box("auto", 500, 3_200, frame);
    document.body.append(box("auto", 900, 1_200, pane));

    expect(scrollParentOf(rows)).toBe(pane);
  });

  it("passes by a box that clips what it holds, and one that shows it", () => {
    laidOut();
    const rows = document.createElement("div");
    const pane = box("scroll", 500, 3_200, box("hidden", 300, 3_000, box("visible", 0, 0, rows)));
    document.body.append(pane);

    expect(scrollParentOf(rows)).toBe(pane);
  });

  it("passes by a box that holds no more than a pixel of rounding past what it shows", () => {
    laidOut();
    const rows = document.createElement("div");
    document.body.append(box("auto", 500, 501, rows));

    expect(scrollParentOf(rows)).toBeNull();
  });

  it("is none where no box around the element scrolls it", () => {
    laidOut();
    const rows = document.createElement("div");
    document.body.append(box("visible", 500, 3_200, rows));

    expect(scrollParentOf(rows)).toBeNull();
  });

  it("is not known yet while the element is not laid out", () => {
    const rows = document.createElement("div");
    document.body.append(box("auto", 500, 3_200, rows));

    expect(scrollParentOf(rows)).toBeUndefined();
  });
});
