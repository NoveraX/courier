import type { LucideIcon } from "lucide-react";
import { Check, Copy, KeyRound, TriangleAlert, X } from "lucide-react";

import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { TONE_DIM, TONE_TEXT } from "@/design/tone";
import type { PayloadChip } from "@/features/requests/payload-view";
import { cn } from "@/lib/utils";

const CHIP_ICON: Readonly<Record<PayloadChip["tone"] | "muted", LucideIcon>> = {
  ok: Check,
  warn: TriangleAlert,
  err: X,
  muted: KeyRound,
};

/** A mark over the code: the payload chips, or a snippet's note. */
export interface CodeChip {
  label: string;
  tone: PayloadChip["tone"] | "muted";
}

interface CodeToolbarProps<TMode extends string> {
  modes: readonly SegmentedOption<TMode>[];
  mode: TMode;
  onMode: (mode: TMode) => void;
  label: string;
  chips: readonly CodeChip[];
  /** Opens or closes every branch of a tree, with what it would do. */
  folding?: { label: string; onClick: () => void } | undefined;
  onCopy: (() => void) | undefined;
}

/**
 * The bar over code in the inspector: its views or flavours, its marks, a
 * way to open or close a whole tree, and Copy.
 *
 * @param props - The modes, the marks, the folding, and what copies
 * @returns The bar
 * @example
 * ```tsx
 * <CodeToolbar label="View" modes={VIEWS} mode={view} onMode={setView} chips={chips} onCopy={copy} />
 * ```
 */
export function CodeToolbar<TMode extends string>({
  modes,
  mode,
  onMode,
  label,
  chips,
  folding,
  onCopy,
}: CodeToolbarProps<TMode>): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <Segmented label={label} options={modes} value={mode} onChange={onMode} quiet="subtle" />
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
        {chips.map((chip) => {
          const Icon = CHIP_ICON[chip.tone];
          return (
            <span
              key={chip.label}
              className={cn(
                "flex h-5.5 shrink-0 items-center gap-1.25 rounded-[6px] px-1.75 text-label whitespace-nowrap",
                TONE_DIM[chip.tone],
                TONE_TEXT[chip.tone],
              )}
            >
              <Icon aria-hidden="true" className="size-2.75" />
              {chip.label}
            </span>
          );
        })}
      </div>
      {folding && (
        <button
          type="button"
          onClick={folding.onClick}
          className="h-6.5 shrink-0 cursor-pointer rounded-[6px] px-2 text-label whitespace-nowrap text-fg-subtle transition-colors hover:bg-raised hover:text-fg pointer-coarse:h-9"
        >
          {folding.label}
        </button>
      )}
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-panel-subtle px-2.5 text-label font-strong text-fg-muted transition-colors hover:text-fg pointer-coarse:h-9"
        >
          <Copy aria-hidden="true" className="size-3" />
          Copy
        </button>
      )}
    </div>
  );
}

/**
 * What a code tab says in place of code.
 *
 * @param props - The title and the line under it
 * @returns The note
 * @example
 * ```tsx
 * <CodeEmpty title="No variables" detail="The call was made without input." />
 * ```
 */
export function CodeEmpty({
  title,
  detail,
  icon: Icon,
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
}): React.ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-line-strong px-4 py-9 text-center">
      <Icon aria-hidden="true" className="size-4.5 text-fg-subtle" />
      <span className="text-ui font-semibold">{title}</span>
      <span className="text-small text-fg-subtle">{detail}</span>
    </div>
  );
}
