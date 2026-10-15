import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";

/* The mark's outline, edge to edge on a 212 by 180 grid. */
const PATH = "M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z";

/* 212 units of 254, centred: 20 of a lucide glyph's 24, between Terminal's 18 and Code's 22, as a filled mark weighs more than a stroke. */
const ICON_BOX = "-21 -37 254 254";

/**
 * The Courier mark, as an icon: one path filled with the text colour, so
 * it follows the theme, taking the props a lucide icon takes, so it goes
 * wherever one does — beside Terminal and Code where Courier's own code is
 * offered. A `viewBox` given replaces the icon's, as the logo's does.
 *
 * @param props - The icon's class, size and colour, as a lucide icon's, and a box of its own
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
      viewBox={ICON_BOX}
      aria-hidden="true"
      focusable="false"
      {...(size !== undefined && { width: size, height: size })}
      {...rest}
    >
      <path fill={color ?? "currentColor"} d={PATH} />
    </svg>
  );
});
