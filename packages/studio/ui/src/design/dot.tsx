import { cn } from "@/lib/utils";

const TONES = {
  current: "bg-current",
  muted: "bg-fg-subtle",
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  brand: "bg-brand",
} as const;

interface DotProps {
  tone: keyof typeof TONES;
  /** Pulses while something is live: recording, a stream open. */
  pulse?: boolean | undefined;
  /** A square stop sign rather than a dot: recording paused. */
  square?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A status dot — `current` takes the colour of the text around it, `muted`
 * says nothing is going on.
 *
 * @param props - Its tone, and whether it pulses or is square
 * @returns The dot
 * @example
 * ```tsx
 * <Dot tone="ok" />
 * ```
 */
export function Dot({ tone, pulse, square, className }: DotProps): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0",
        square ? "rounded-[1px]" : "rounded-full",
        pulse && "animate-pulse-live",
        TONES[tone],
        className,
      )}
    />
  );
}
