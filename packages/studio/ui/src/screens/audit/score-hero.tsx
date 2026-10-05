import { TONE_TEXT } from "@/design/tone";
import { gradeOf } from "@/features/audit/audit-score";
import { AUDIT_SEVERITIES } from "@/features/audit/audit-search";
import type { SeverityCounts } from "@/features/audit/finding-filter";
import type { AuditCategory } from "@/features/audit/types";
import { cn } from "@/lib/utils";
import { SEVERITY_LOOK } from "./audit-look";
import { CategoryCards } from "./category-cards";

/* The ring's colour, as a CSS colour for its conic gradient. */
const RING_COLOR = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
} as const;

interface ScoreHeroProps {
  score: number;
  counts: SeverityCounts;
  categories: Readonly<Record<AuditCategory, number>>;
  tallies: Readonly<Record<AuditCategory, { open: number; passed: number }>>;
  category: AuditCategory | undefined;
  onCategory: (category: AuditCategory) => void;
}

/**
 * The top of the Audit page: the score in its ring, what it is called and
 * what needs doing, the findings by severity, and a card a category with
 * its own score that narrows the list to it.
 *
 * @param props - The score, the counts, the categories' scores and tallies, the category chosen, and what chooses one
 * @returns The section
 * @example
 * ```tsx
 * <ScoreHero score={88} counts={counts} categories={scores} tallies={tallies} category={undefined} onCategory={pick} />
 * ```
 */
export function ScoreHero(props: ScoreHeroProps): React.ReactNode {
  const { score, counts, categories, tallies, category, onCategory } = props;
  const grade = gradeOf(score);
  return (
    <section
      aria-label="Score"
      className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] overflow-hidden rounded-[16px] border border-line bg-panel"
    >
      <div className="-mb-px flex items-center gap-5.5 border-r border-b border-line px-6 py-5.5">
        <div
          className="relative size-31 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${RING_COLOR[grade.tone]} 0 ${score}%, var(--color-raised) ${score}% 100%)`,
          }}
        >
          <div className="absolute inset-2.5 flex flex-col items-center justify-center gap-0.5 rounded-full bg-panel">
            <span
              className={cn(
                "font-mono text-score leading-none font-medium tracking-[-0.05em]",
                TONE_TEXT[grade.tone],
              )}
            >
              {score}
            </span>
            <span className="text-badge text-fg-subtle">of 100</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.75">
            <span
              className={cn("text-metric font-semibold tracking-[-0.02em]", TONE_TEXT[grade.tone])}
            >
              {grade.label}
            </span>
            <span className="text-control leading-[1.45] text-pretty text-fg-muted">
              {`${counts.error} ${counts.error === 1 ? "issue needs" : "issues need"} fixing before release, ${counts.warning} ${counts.warning === 1 ? "is" : "are"} worth a look.`}
            </span>
          </div>
          <div className="flex flex-wrap gap-3.5">
            {AUDIT_SEVERITIES.map((severity) => (
              <span key={severity} className="flex items-center gap-1.5 text-small text-fg-muted">
                <span className={cn("size-1.75 rounded-full", SEVERITY_LOOK[severity].fill)} />
                <span className="font-mono font-semibold text-fg">{counts[severity]}</span>
                {SEVERITY_LOOK[severity].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
      <CategoryCards
        scores={categories}
        tallies={tallies}
        chosen={category}
        onChoose={onCategory}
      />
    </section>
  );
}
