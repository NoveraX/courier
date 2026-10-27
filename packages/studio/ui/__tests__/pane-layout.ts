import { vi } from "vitest";

/** A pane a list of rows scrolls in, laid out as a browser lays it out. */
export interface Pane {
  element: HTMLDivElement;
  /** Scrolls the pane to a point below its top, as a person does. */
  scrollTo: (top: number) => void;
}

interface PaneLayout {
  /** How tall the pane's view is. */
  height: number;
  /** How tall a row is drawn. */
  rowHeight: number;
  /** How far below the pane's top the list starts, under what stands above it. */
  above?: number;
}

/* The element a list places its rows in: positioned, as tall as all its rows. */
function isList(element: Element): boolean {
  return element instanceof HTMLElement && element.classList.contains("relative");
}

/**
 * A pane that scrolls a list up and down, in the page, with the layout a
 * browser would give it — jsdom lays nothing out: the pane shows `height`
 * pixels and holds more than it shows, the list in it starts `above`
 * pixels below its top and moves as it scrolls, and each row of the list
 * is `rowHeight` tall. Everything in the page is laid out, nothing hidden.
 * Restored by `vi.restoreAllMocks()`.
 *
 * @param layout - The pane's height, a row's height, and what stands above the list
 * @returns The pane, and what scrolls it
 * @example
 * ```ts
 * const pane = layOutPane({ height: 500, rowHeight: 25 });
 * render(<TreeRows rows={rows} query="" current={undefined} onToggle={vi.fn()} />, { container: pane.element });
 * ```
 */
export function layOutPane({ height, rowHeight, above = 0 }: PaneLayout): Pane {
  const element = document.createElement("div");
  element.style.overflowY = "auto";
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  Object.defineProperty(element, "scrollHeight", { value: 10_000_000, configurable: true });
  document.body.append(element);
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    () => [new DOMRect()] as unknown as DOMRectList,
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === element) return new DOMRect(0, 0, 800, height);
    if (this.parentElement && isList(this.parentElement)) return new DOMRect(0, 0, 800, rowHeight);
    if (isList(this)) return new DOMRect(0, above - element.scrollTop, 800, 0);
    return new DOMRect();
  });
  return {
    element,
    scrollTo: (top) => {
      element.scrollTop = top;
      element.dispatchEvent(new Event("scroll"));
    },
  };
}
