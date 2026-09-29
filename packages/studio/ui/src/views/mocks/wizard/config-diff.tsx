import { cn } from "@/lib/utils";
import { diffStats } from "./diff-stats";
import type { DiffHunk, DiffLine } from "./wire-types";

const MARK: Record<DiffLine["kind"], string> = { context: " ", add: "+", remove: "−" };
const SPOKEN: Record<DiffLine["kind"], string> = {
  context: "",
  add: "added: ",
  remove: "removed: ",
};

function DiffRow({ line }: { line: DiffLine }): React.ReactElement {
  return (
    <div
      className={cn(
        "flex min-w-max",
        line.kind === "add" && "bg-emerald-500/10 text-emerald-300",
        line.kind === "remove" && "bg-rose-500/10 text-rose-300",
      )}
    >
      <span className="w-10 shrink-0 select-none pr-2 text-right mono-xs tabular-nums text-muted-foreground/60">
        {line.oldLine ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none pr-2 text-right mono-xs tabular-nums text-muted-foreground/60">
        {line.newLine ?? ""}
      </span>
      <span aria-hidden className="w-4 shrink-0 select-none mono-sm">
        {MARK[line.kind]}
      </span>
      <span className="sr-only">{SPOKEN[line.kind]}</span>
      <span className="whitespace-pre pr-3 mono-sm [tab-size:2]">{line.text}</span>
    </div>
  );
}

/**
 * The exact change Studio plans to a file, as a line diff: both files' line
 * numbers, the added and removed lines marked, and each line's text shown
 * as text — never interpreted as markup — without wrapping, so what is
 * shown is what is written.
 *
 * @param props.target - The file, relative to the project root
 * @param props.hunks - The diff Studio sent
 * @returns The diff
 *
 * @example
 * ```tsx
 * <ConfigDiff target={plan.target} hunks={plan.hunks} />
 * ```
 */
export function ConfigDiff({
  target,
  hunks,
}: {
  target: string;
  hunks: readonly DiffHunk[];
}): React.ReactElement {
  const { added, removed } = diffStats(hunks);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex h-8 items-center gap-2 border-b border-zinc-800 px-3">
        <span className="truncate mono-xs text-zinc-300">{target}</span>
        <span className="ml-auto mono-xs tabular-nums text-emerald-400">+{added}</span>
        <span className="mono-xs tabular-nums text-rose-400">−{removed}</span>
      </div>
      <div className="max-h-72 overflow-auto py-2 text-zinc-200">
        {hunks.map((hunk, index) => (
          <div key={`${hunk.lines[0]?.oldLine ?? 0}:${hunk.lines[0]?.newLine ?? 0}`}>
            {index > 0 && (
              <div className="select-none px-3 py-1 mono-xs text-muted-foreground/60">⋯</div>
            )}
            {hunk.lines.map((line) => (
              <DiffRow
                key={`${line.kind}:${line.oldLine ?? ""}:${line.newLine ?? ""}`}
                line={line}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
