/**
 * Cursor tracking + wheel-zoom binding for the waterfall canvas.
 *
 * Owns:
 *  - the cursor X state used to render the scrubber line
 *  - the rAF-batched mousemove handler
 *  - the non-passive `wheel` listener that intercepts pinch/ctrl-scroll zoom
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface UseCanvasCursorOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  draggingRef: React.MutableRefObject<boolean>;
  labelWidth: number;
  onWheelZoom: (deltaY: number, clientX: number, canvasLeft: number) => void;
}

export interface UseCanvasCursorReturn {
  cursorX: number | null;
  setCursorX: (x: number | null) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
}

export function useCanvasCursor({
  scrollRef,
  draggingRef,
  labelWidth,
  onWheelZoom,
}: UseCanvasCursorOptions): UseCanvasCursorReturn {
  const [cursorX, setCursorX] = useState<number | null>(null);
  const rafRef = useRef(0);

  // Native wheel listener (non-passive) to prevent browser zoom on pinch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      onWheelZoom(e.deltaY, e.clientX, rect.left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheelZoom, scrollRef]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft - labelWidth;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setCursorX(x);
        rafRef.current = 0;
      });
    },
    [labelWidth, draggingRef, scrollRef],
  );

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setCursorX(null);
  }, []);

  return { cursorX, setCursorX, handleMouseMove, handleMouseLeave };
}
