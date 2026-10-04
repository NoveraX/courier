import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand-dim text-brand",
  ok: "bg-ok-dim text-ok",
  warn: "bg-warn-dim text-warn",
  err: "bg-err-dim text-err",
} as const;

/** The status a badge's colour tells. */
export type BadgeTone = keyof typeof TONES;

interface CountBadgeProps {
  tone: BadgeTone;
  children: React.ReactNode;
}

/**
 * A count or score in a pill: the requests beside Timeline, the audit's grade.
 *
 * @param props - Its tone and what it shows
 * @returns The badge
 * @example
 * ```tsx
 * <CountBadge tone="brand">97</CountBadge>
 * ```
 */
export function CountBadge({ tone, children }: CountBadgeProps): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 min-w-5.5 items-center justify-center rounded-full px-1.5 text-badge font-strong tabular-nums",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
