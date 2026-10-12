import { FileCode2, FolderOpen } from "lucide-react";

import type { DiffHunk, DiffLine } from "@/features/mocks/wizard/wire-types";
import { cn } from "@/lib/utils";

const MARK: Readonly<Record<DiffLine["kind"], string>> = { context: " ", add: "+", remove: "−" };
const SPOKEN: Readonly<Record<DiffLine["kind"], string>> = {
  context: "",
  add: "added: ",
  remove: "removed: ",
};
const ROW: Readonly<Record<DiffLine["kind"], string>> = {
  context: "",
  add: "bg-ok-dim text-ok",
  remove: "bg-err-dim text-err",
};

function countOf(hunks: readonly DiffHunk[], kind: DiffLine["kind"]): number {
  return hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.kind === kind).length, 0);
}

function folderOf(target: string): string {
  const cut = target.lastIndexOf("/");
  return cut < 0 ? "./" : `${target.slice(0, cut + 1)}`;
}

function DiffRow({ line }: { line: DiffLine }): React.ReactNode {
  return (
    <div className={cn("flex min-h-5 min-w-max", ROW[line.kind])}>
      <span className="w-9 shrink-0 pr-2 text-right text-fg-subtle opacity-60 select-none">
        {line.oldLine ?? ""}
      </span>
      <span className="w-9 shrink-0 pr-2 text-right text-fg-subtle opacity-60 select-none">
        {line.newLine ?? ""}
      </span>
      <span aria-hidden="true" className="w-4 shrink-0 select-none">
        {MARK[line.kind]}
      </span>
      <span className="sr-only">{SPOKEN[line.kind]}</span>
      <span
        className={cn(
          "pr-3.5 whitespace-pre [tab-size:2]",
          line.kind === "context" && "text-syntax-plain",
        )}
      >
        {line.text}
      </span>
    </div>
  );
}

/**
 * The exact change Studio will make, as the design previews generated
 * files: the file it writes on the left with how many lines the change adds
 * and removes, every line it changes on the right, between the lines around
 * them — on a phone, the file over the lines.
 *
 * @param props - The file and the change's pieces
 * @returns The preview
 * @example
 * ```tsx
 * <ChangePreview target="courier.mocks.ts" hunks={outcome.hunks} />
 * ```
 */
export function ChangePreview({
  target,
  hunks,
}: {
  target: string;
  hunks: readonly DiffHunk[];
}): React.ReactNode {
  const name = target.slice(target.lastIndexOf("/") + 1);
  const added = countOf(hunks, "add");
  const removed = countOf(hunks, "remove");
  return (
    <div className="grid min-h-60 grid-cols-[190px_minmax(0,1fr)] gap-3 max-sm:grid-cols-[minmax(0,1fr)] max-sm:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-px rounded-[11px] border border-line bg-inset p-2 font-mono text-small">
        <span className="flex items-center gap-1.5 px-1.5 py-1.25 text-fg-subtle">
          <FolderOpen aria-hidden="true" className="size-3" />
          {folderOf(target)}
        </span>
        <span className="flex h-7 items-center gap-1.75 rounded-[6px] bg-brand-dim pr-2 pl-5.5 text-fg">
          <FileCode2 aria-hidden="true" className="size-3 text-fg-subtle" />
          <span className="flex-1 truncate" title={target}>
            {name}
          </span>
          {added > 0 && <span className="text-micro text-ok">+{added}</span>}
          {removed > 0 && <span className="text-micro text-err">−{removed}</span>}
        </span>
      </div>
      <section
        aria-label={`Change to ${target}`}
        className="max-h-80 overflow-auto rounded-[11px] border border-line bg-inset pt-2.5 pb-3 font-mono text-small leading-[1.7]"
      >
        {hunks.map((hunk, index) => (
          <div key={`${hunk.lines[0]?.oldLine ?? 0}:${hunk.lines[0]?.newLine ?? 0}`}>
            {index > 0 && <div className="px-3 py-0.5 text-fg-subtle select-none">⋯</div>}
            {hunk.lines.map((line) => (
              <DiffRow
                key={`${line.kind}:${line.oldLine ?? ""}:${line.newLine ?? ""}`}
                line={line}
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
