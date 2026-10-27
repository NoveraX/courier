import { useLayoutEffect, useState } from "react";

import { type RowSpan, rowSpanOf } from "@/lib/row-span";
import { scrollParentOf } from "@/lib/scroll-parent";

/** The most rows a list draws every one of; a longer one draws the rows its pane shows. */
export const EVERY_ROW_UP_TO = 500;

/* Every row, or the span the pane shows; unknown until the list is laid out in its pane. */
type Drawn = "every" | RowSpan;

const NONE: readonly number[] = [];

/* How many of the rows drawn are measured for a row's height. */
const MEASURED = 50;

interface RowWindowOptions {
  /** The element the rows sit in: each row's top is its index times the row height, from its top. */
  listRef: React.RefObject<HTMLElement | null>;
  /** How many rows the list has. */
  count: number;
  /** A row's height until one is drawn and measured, in CSS pixels. */
  estimate: number;
  /** Rows drawn however the pane is scrolled — the current match, the focused row — by index; others are passed by. */
  kept?: readonly number[] | undefined;
}

/** A list's rows as the pane it scrolls in shows them. */
export interface RowWindow {
  /** A row's height, as drawn. */
  rowHeight: number;
  /** The rows to draw, by index, in order. */
  indexes: readonly number[];
}

/**
 * Which rows of a list, all one height, to draw: every one of a short list,
 * and of a long one those the pane it scrolls in shows, a few past either
 * edge, and the ones kept — so a body of thousands of rows costs the page
 * what a screenful does. The pane is the nearest box around the list that
 * scrolls it, found again when the list or the pane changes size; where
 * none does, every row is drawn. A row's height is measured once one is
 * drawn.
 *
 * @param options - Where the rows sit, how many, a row's height until one is measured, and the rows kept
 * @returns A row's height, and which rows to draw
 * @example
 * ```tsx
 * const { rowHeight, indexes } = useRowWindow({ listRef, count: rows.length, estimate: 25 });
 * <div ref={listRef} className="relative" style={{ height: rows.length * rowHeight }}>…</div>
 * ```
 */
export function useRowWindow({
  listRef,
  count,
  estimate,
  kept = NONE,
}: RowWindowOptions): RowWindow {
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const [drawn, setDrawn] = useState<Drawn | undefined>(undefined);
  const rowHeight = measured ?? estimate;
  const short = count <= EVERY_ROW_UP_TO;
  useLayoutEffect(() => {
    const height = drawnRowHeight(listRef.current);
    if (height !== undefined && Math.abs(height - rowHeight) > 0.01) setMeasured(height);
  });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (short || !list) return;
    return followPane(list, (view) => rowSpanOf(view, rowHeight, count), setDrawn);
  }, [listRef, short, rowHeight, count]);
  const span = drawn ?? rowSpanOf({ offset: 0, height: firstViewHeight() }, rowHeight, count);
  const indexes = short || span === "every" ? everyRow(count) : withKept(span, count, kept);
  return { rowHeight, indexes };
}

/*
 * Follow the pane a list scrolls in, telling the rows it shows as it
 * scrolls and resizes. The pane is looked for again whenever the list or
 * the pane changes size: a narrower window can move the scrolling to a box
 * further out, and a list laid out only once a hidden pane shows is found
 * then.
 */
function followPane(
  list: HTMLElement,
  spanOf: (view: { offset: number; height: number }) => RowSpan,
  report: React.Dispatch<React.SetStateAction<Drawn | undefined>>,
): () => void {
  let pane: HTMLElement | null | undefined;
  const update = (): void => {
    if (pane === undefined) return;
    const next: Drawn = pane === null ? "every" : spanOf(viewOver(list, pane));
    report((current) => (sameDrawn(current, next) ? current : next));
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(find);
  function find(): void {
    const next = scrollParentOf(list);
    if (next !== pane) {
      pane?.removeEventListener("scroll", update);
      if (pane) observer?.unobserve(pane);
      pane = next;
      pane?.addEventListener("scroll", update, { passive: true });
      if (pane) observer?.observe(pane);
    }
    update();
  }
  observer?.observe(list);
  find();
  return () => {
    observer?.disconnect();
    pane?.removeEventListener("scroll", update);
  };
}

/* Where the pane's view stands over the list: the top of what the pane shows, from the list's top. */
function viewOver(list: HTMLElement, pane: HTMLElement): { offset: number; height: number } {
  const top = pane.getBoundingClientRect().top + pane.clientTop;
  return { offset: top - list.getBoundingClientRect().top, height: pane.clientHeight };
}

function sameDrawn(a: Drawn | undefined, b: Drawn): boolean {
  if (a === undefined || a === "every" || b === "every") return a === b;
  return a.first === b.first && a.last === b.last;
}

/* The rows are all one height: the first ones drawn tell it. A row drawn taller, by a glyph
   from another font, is not the measure. */
function drawnRowHeight(list: HTMLElement | null): number | undefined {
  let least: number | undefined;
  for (const row of [...(list?.children ?? [])].slice(0, MEASURED)) {
    const height = row.getBoundingClientRect().height;
    if (height > 0 && (least === undefined || height < least)) least = height;
  }
  return least;
}

/* Before the pane is known, the rows a window's height holds from the top. */
function firstViewHeight(): number {
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

function everyRow(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function withKept(span: RowSpan, count: number, kept: readonly number[]): number[] {
  const indexes = new Set<number>();
  for (let index = span.first; index <= span.last; index += 1) indexes.add(index);
  for (const index of kept) if (index >= 0 && index < count) indexes.add(index);
  return [...indexes].sort((a, b) => a - b);
}
