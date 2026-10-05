import { cn } from "@/lib/utils";

/** The two sides of a comparison. */
export type Side = "a" | "b";

/* A is drawn in the brand colour, B in violet, everywhere they appear. */
const SIDE_LOOK: Readonly<Record<Side, string>> = {
  a: "text-brand",
  b: "text-syntax-keyword",
};

/** Text in a side's colour. */
export function sideText(side: Side): string {
  return SIDE_LOOK[side];
}

/**
 * A side's letter on a tile tinted in its colour: A or B.
 *
 * @param props - The side, and the tile's size
 * @returns The tag
 * @example
 * ```tsx
 * <SideTag side="a" size="lg" />
 * ```
 */
export function SideTag({
  side,
  size = "sm",
}: {
  side: Side;
  size?: "sm" | "lg";
}): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-[color-mix(in_srgb,currentColor_14%,transparent)] font-mono font-bold",
        size === "lg" ? "size-7.5 rounded-[9px] text-ui" : "size-5 rounded-[6px] text-meta",
        SIDE_LOOK[side],
      )}
    >
      {side.toUpperCase()}
    </span>
  );
}
