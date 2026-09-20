import { cn } from "@/lib/utils"

interface MarkProps {
  className?: string
  size?: number
}

/**
 * The Courier mark.
 *
 * One closed path filled with `currentColor`, so it takes the colour of
 * whatever it sits in and needs no second file for the dark theme.
 */
export function CourierMark({ className, size = 24 }: MarkProps) {
  return (
    <svg
      viewBox="0 0 212 180"
      width={size * 1.18}
      height={size}
      role="img"
      aria-label="Courier"
      className={cn("shrink-0", className)}
    >
      <path
        fill="currentColor"
        d="M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z"
      />
    </svg>
  )
}

interface LogoProps {
  /** Height of the wordmark in pixels; the mark and any subtitle follow it. */
  size?: number
  /** Names the thing this logo stands for, set at 30% of the wordmark. */
  subtitle?: string
  className?: string
}

/**
 * The mark beside the name.
 *
 * The name is set in the site's own typeface rather than shipped as an image,
 * so it stays sharp at any size and in either theme.
 */
export function CourierLogo({ size = 22, subtitle, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: size * 0.24 }}>
      <CourierMark size={size * 1.05} />
      <span className="flex flex-col items-start">
        <span className="font-black leading-[0.95] tracking-[-0.04em]" style={{ fontSize: size }}>
          courier
        </span>
        {subtitle ? (
          <span
            className="font-semibold leading-[1.15] tracking-[-0.01em]"
            style={{ fontSize: size * 0.3, marginTop: size * 0.05 }}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  )
}
