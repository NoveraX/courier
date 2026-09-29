/**
 * Hook that wires up the draggable resize handle for the waterfall label
 * column. Pure DOM/state plumbing.
 *
 * The caller owns `labelWidth` (so other layers like `useCanvasCursor` can
 * read it) and passes the setter in. The hook installs/cleans up global
 * mousemove/up listeners during the drag and resolves the final width on
 * mouseup.
 */

import { useCallback, useRef } from "react";

export const LABEL_MIN_WIDTH = 180;
export const LABEL_MAX_WIDTH = 500;

interface UseLabelResizeOptions {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  draggingRef: React.MutableRefObject<boolean>;
  labelWidth: number;
  setLabelWidth: (width: number) => void;
  onDragStart: () => void;
}

export interface UseLabelResizeReturn {
  cornerRef: React.RefObject<HTMLDivElement | null>;
  labelColRef: React.RefObject<HTMLDivElement | null>;
  handleRef: React.RefObject<HTMLDivElement | null>;
  handleDragStart: (e: React.MouseEvent) => void;
}

export function useLabelResize({
  scrollRef,
  draggingRef,
  labelWidth,
  setLabelWidth,
  onDragStart,
}: UseLabelResizeOptions): UseLabelResizeReturn {
  const cornerRef = useRef<HTMLDivElement>(null);
  const labelColRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      onDragStart();
      const startX = e.clientX;
      const startW = labelWidth;

      // Disable pointer events on scroll container during drag to prevent tooltip flicker
      if (scrollRef.current) scrollRef.current.style.pointerEvents = "none";

      let dragRaf = 0;
      const onMove = (ev: MouseEvent): void => {
        if (dragRaf) return;
        dragRaf = requestAnimationFrame(() => {
          const w = Math.min(
            LABEL_MAX_WIDTH,
            Math.max(LABEL_MIN_WIDTH, startW + ev.clientX - startX),
          );
          if (cornerRef.current) cornerRef.current.style.width = `${w}px`;
          if (labelColRef.current) labelColRef.current.style.width = `${w}px`;
          if (handleRef.current) handleRef.current.style.left = `${w - 6}px`;
          dragRaf = 0;
        });
      };
      const onUp = (): void => {
        draggingRef.current = false;
        if (scrollRef.current) scrollRef.current.style.pointerEvents = "";
        const finalW = labelColRef.current ? parseFloat(labelColRef.current.style.width) : startW;
        setLabelWidth(finalW);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [labelWidth, scrollRef, draggingRef, setLabelWidth, onDragStart],
  );

  return { cornerRef, labelColRef, handleRef, handleDragStart };
}
