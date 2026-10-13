import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";

/**
 * The Courier mark alone, as an icon: where Courier's own code is offered
 * beside other kinds — a snippet, a Copy as choice — and in the logo. One
 * path filled with the text colour, so it follows the theme; it takes the
 * props a lucide icon takes, so it goes wherever one does.
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
      viewBox="0 0 212 180"
      aria-hidden="true"
      focusable="false"
      {...(size !== undefined && { width: size, height: size })}
      {...rest}
    >
      <path
        fill={color ?? "currentColor"}
        d="M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z"
      />
    </svg>
  );
});
