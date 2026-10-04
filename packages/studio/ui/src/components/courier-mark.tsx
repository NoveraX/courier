import { cn } from "@/lib/utils";

interface CourierMarkProps {
  className?: string;
  size?: number;
}

/**
 * The Courier mark.
 *
 * One closed path filled with `currentColor`, so it takes the colour of
 * whatever it sits in and needs no second file for the dark theme.
 */
export function CourierMark({ className, size = 18 }: CourierMarkProps): React.ReactElement {
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
  );
}
