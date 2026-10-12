import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BUTTON =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card px-3.5 text-control font-semibold disabled:cursor-default disabled:opacity-50 pointer-coarse:h-10";
const TONES = {
  next: `${BUTTON} bg-fg text-bg hover:bg-fg/90`,
  outline: `${BUTTON} border border-line font-normal text-fg-muted hover:border-line-strong hover:text-fg`,
  brand: `${BUTTON} bg-brand text-bg hover:bg-brand/90`,
} as const;

/**
 * A button in the import's footer: the step's next move, Back, or the
 * write — with its icon, which turns into a spinner while it runs.
 *
 * @param props - What it says, how it looks, and what it does
 * @returns The button
 * @example
 * ```tsx
 * <FooterAction label="Continue" icon={ArrowRight} tone="next" onClick={next} />
 * ```
 */
export function FooterAction({
  label,
  icon: Icon,
  busy = false,
  tone,
  disabled = false,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  busy?: boolean;
  tone: keyof typeof TONES;
  disabled?: boolean;
  onClick: () => void;
}): React.ReactNode {
  const Shown = busy ? Loader2 : Icon;
  return (
    <button type="button" className={TONES[tone]} disabled={disabled} onClick={onClick}>
      {Shown && <Shown aria-hidden="true" className={cn("size-3.25", busy && "animate-spin")} />}
      {label}
    </button>
  );
}
