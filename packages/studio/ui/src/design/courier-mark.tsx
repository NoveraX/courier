import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";

/** The mark's outline, edge to edge on a 212 by 180 grid; the logo draws it unpadded. */
export const COURIER_MARK_PATH = "M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z";

/** The tight box around {@link COURIER_MARK_PATH}. */
export const COURIER_MARK_BOUNDS = "0 0 212 180";

/**
 * The Courier mark alone, as an icon: where Courier's own code is offered
 * beside other kinds — a snippet, a Copy as choice. The logo draws the
 * same path without the room kept around it here. One path filled with the
 * text colour, so it follows the theme; it takes the props a lucide icon
 * takes, so it goes wherever one does.
 *
 * A lucide glyph keeps clear room inside its 24-unit box: Terminal inks 18
 * units across, Code and Copy 22. The mark sits centred in a square box,
 * 212 of 254 units, which is 20 of 24, between the two: a filled mark
 * weighs more than a 2-unit stroke, so it stays narrower than the widest
 * glyph, and at any size class it reads as large as the icons beside it.
 *
 * @param props - The icon's class, size and colour, as a lucide icon's
 * @returns The mark
 * @example
 * ```tsx
 * <CourierMark aria-hidden="true" className="size-3" />
 * ```
 */
export const CourierMark = forwardRef<SVGSVGElement, LucideProps>(function CourierMark(
  { size, color, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absolute, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      viewBox="-21 -37 254 254"
      aria-hidden="true"
      focusable="false"
      {...(size !== undefined && { width: size, height: size })}
      {...rest}
    >
      <path fill={color ?? "currentColor"} d={COURIER_MARK_PATH} />
    </svg>
  );
});
