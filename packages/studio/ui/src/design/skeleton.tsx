import { cn } from "@/lib/utils";

/**
 * A block standing in for content still on its way: sized like what it
 * replaces, pulsing unless the reader asked for less motion. Hidden from
 * assistive technology; the region around it says it is loading.
 *
 * @param props - The block's size and shape, and a style for what classes cannot say
 * @returns The block
 * @example
 * ```tsx
 * <Skeleton className="h-3.5 w-32" />
 * ```
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  /** For a size or place only data decides, such as a bar's offset on a track. */
  style?: React.CSSProperties;
}): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn("block shrink-0 rounded-chip bg-raised motion-safe:animate-pulse", className)}
    />
  );
}
