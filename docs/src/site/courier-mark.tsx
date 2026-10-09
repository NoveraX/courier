import { cn } from "@/site/cn"

/**
 * Courier's mark, drawn in the colour of the text around it.
 *
 * @param props - Its width in pixels, the height following; or classes that size it
 * @returns The mark
 * @example
 * ```tsx
 * <CourierMark width={19} />
 * ```
 */
export function CourierMark({
  width = 19,
  className,
}: {
  width?: number
  className?: string | undefined
}) {
  return (
    <svg
      width={width}
      height={(width * 180) / 212}
      viewBox="0 0 212 180"
      aria-hidden="true"
      focusable="false"
      className={cn("block", className)}
    >
      <path
        fill="currentColor"
        d="M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z"
      />
    </svg>
  )
}
