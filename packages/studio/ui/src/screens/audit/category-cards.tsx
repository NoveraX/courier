import { TONE_FILL, TONE_TEXT } from "@/design/tone";
import { CATEGORY_ORDER } from "@/features/audit/audit-meta";
import { scoreTone } from "@/features/audit/audit-score";
import type { CategoryTally } from "@/features/audit/finding-filter";
import type { AuditCategory } from "@/features/audit/types";
import { cn } from "@/lib/utils";
import { CATEGORY_LOOK } from "./audit-look";

interface CategoryCardsProps {
  scores: Readonly<Record<AuditCategory, number>>;
  tallies: Readonly<Record<AuditCategory, CategoryTally>>;
  chosen: AuditCategory | undefined;
  onChoose: (category: AuditCategory) => void;
}

function tallyLine({ open, passed }: CategoryTally): string {
  if (open === 0) return "All checks passed";
  return `${open} finding${open === 1 ? "" : "s"} · ${passed} passed`;
}

/**
 * A card a category — its icon, name and score with a bar, and what it
 * found — that narrows the findings to it, or, chosen, shows them all
 * again.
 *
 * @param props - The categories' scores and tallies, the one chosen, and what chooses
 * @returns The cards, two by two
 * @example
 * ```tsx
 * <CategoryCards scores={scores} tallies={tallies} chosen="security" onChoose={pick} />
 * ```
 */
export function CategoryCards({
  scores,
  tallies,
  chosen,
  onChoose,
}: CategoryCardsProps): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-px bg-line">
      {CATEGORY_ORDER.map((category) => {
        const look = CATEGORY_LOOK[category];
        const Icon = look.icon;
        const score = scores[category];
        const tone = scoreTone(score);
        return (
          <button
            key={category}
            type="button"
            aria-pressed={chosen === category}
            onClick={() => onChoose(category)}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col gap-2.5 px-4.5 py-4 text-left transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              chosen === category ? "bg-brand-tint" : "bg-panel",
            )}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-6.5 shrink-0 items-center justify-center rounded-[7px] bg-[color-mix(in_srgb,currentColor_13%,transparent)]",
                  look.text,
                )}
              >
                <Icon aria-hidden="true" className="size-3.25" />
              </span>
              <span className="min-w-0 flex-1 truncate text-control font-semibold">
                {look.label}
              </span>
              <span className={cn("shrink-0 font-mono text-prompt font-medium", TONE_TEXT[tone])}>
                {score}
              </span>
            </span>
            <span className="h-1 w-full overflow-hidden rounded-[2px] bg-raised">
              <span
                className={cn("block h-full rounded-[2px]", TONE_FILL[tone])}
                style={{ width: `${score}%` }}
              />
            </span>
            <span className="text-label text-fg-subtle">{tallyLine(tallies[category])}</span>
          </button>
        );
      })}
    </div>
  );
}
