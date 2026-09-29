import type React from "react";

/** How far one arrow key moves a resize handle, in px. */
const STEP = 16;

/**
 * Resize with the arrow keys, for a handle that the pointer drags: each
 * press moves the edge by 16 px, within the bounds.
 *
 * @param resize - Applies the new size
 * @param bounds - The size now, the smallest and the largest, and which way it grows
 * @returns A key handler for the handle
 * @example
 * ```tsx
 * <div role="separator" tabIndex={0} onKeyDown={resizeKeys(setWidth, { size: width, min: 320, max: 800, grows: "left" })} />
 * ```
 */
export function resizeKeys(
  resize: (size: number) => void,
  { size, min, max, grows }: { size: number; min: number; max: number; grows: "left" | "right" },
): (event: React.KeyboardEvent) => void {
  return (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const outward = (event.key === "ArrowLeft") === (grows === "left");
    resize(Math.min(max, Math.max(min, size + (outward ? STEP : -STEP))));
  };
}
