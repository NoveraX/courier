import { Check, Loader2 } from "lucide-react";

import type { ReuploadState } from "@/apis/parse-raw-spec";
import { parseRawSpec } from "@/apis/parse-raw-spec";
import type { UseManageReturn } from "@/apis/use-manage";
import type { FilePlanSummary } from "@/features/apis/types-file-plan";
import { cn } from "@/lib/utils";

const BUTTON =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card px-3.5 text-control font-semibold disabled:cursor-default disabled:opacity-50";
const NEXT = `${BUTTON} bg-fg text-bg hover:bg-fg/90`;
const OUTLINE = `${BUTTON} border border-line font-normal text-fg-muted hover:border-line-strong hover:text-fg`;

/* The endpoints picked to add and remove, and those the update takes away. */
function changesOf(manage: UseManageReturn): number {
  const count = (map: Record<string, Set<string>>) =>
    Object.values(map).reduce((n, set) => n + set.size, 0);
  const dropped = (manage.inventory?.groups ?? []).reduce(
    (n, group) => n + group.endpoints.filter((ep) => ep.status === "removed-from-spec").length,
    0,
  );
  return count(manage.toAdd) + count(manage.toRemove) + dropped;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/* What applying the plan does to the files, as the note after it says it was done. */
function planNote(plan: FilePlanSummary | undefined): string {
  const written = plan?.writes.filter((file) => file.action !== "unchanged").length ?? 0;
  const removed = plan?.removals.length ?? 0;
  const writes = `${plural(written, "file", "files")} to write`;
  return removed > 0 ? `${writes}, ${removed} to remove` : writes;
}

function noteOf(manage: UseManageReturn): string {
  if (manage.step === "reupload") return "The spec, again";
  if (manage.step === "inventory" && manage.inventory?.specChanged)
    return `The update, with ${plural(changesOf(manage), "change", "changes")} to endpoints`;
  if (manage.step === "inventory")
    return `${plural(changesOf(manage), "change", "changes")} selected`;
  if (manage.step === "preview" || manage.step === "applying")
    return planNote(manage.consent?.plan);
  return "";
}

interface ManageFooterProps {
  manage: UseManageReturn;
  reupload: ReuploadState;
  onReupload: (update: Partial<ReuploadState>) => void;
}

/**
 * The manage dialog's footer: where it stands, Later, Back, and the step's
 * next move — Parse and continue, Preview changes, Apply them, or Preview
 * again once files Studio cannot write are dealt with.
 *
 * @param props - The manage flow, the spec given again, and what reading it updates
 * @returns The footer
 * @example
 * ```tsx
 * <ManageFooter manage={manage} reupload={reupload} onReupload={update} />
 * ```
 */
export function ManageFooter({ manage, reupload, onReupload }: ManageFooterProps): React.ReactNode {
  const applying = manage.step === "applying";
  const reviewing = manage.step === "preview" || applying;
  const canGoBack =
    manage.step === "preview" || (manage.step === "inventory" && manage.importType !== "url");
  const blocked = (manage.consent?.plan.blocked.length ?? 0) > 0;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel-subtle px-5 py-3">
      <span className="truncate text-small text-fg-subtle">{noteOf(manage)}</span>
      <div className="flex-1" />
      <button type="button" className={OUTLINE} disabled={applying} onClick={manage.close}>
        Later
      </button>
      {canGoBack && (
        <button type="button" className={OUTLINE} disabled={applying} onClick={manage.back}>
          Back
        </button>
      )}
      {manage.step === "reupload" && (
        <button
          type="button"
          className={NEXT}
          disabled={!reupload.content.trim() || reupload.parsing}
          onClick={() =>
            void parseRawSpec(reupload.content, (spec) => void manage.provideSpec(spec), onReupload)
          }
        >
          {reupload.parsing && <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />}
          Parse and continue
        </button>
      )}
      {manage.step === "inventory" && (
        <button
          type="button"
          className={NEXT}
          disabled={!manage.hasChanges && !manage.inventory?.specChanged}
          onClick={() => void manage.requestPreview()}
        >
          Preview changes
        </button>
      )}
      {reviewing && blocked && (
        <button
          type="button"
          className={NEXT}
          disabled={applying}
          onClick={() => void manage.requestPreview()}
        >
          Preview again
        </button>
      )}
      {reviewing && !blocked && (
        <button
          type="button"
          className={cn(BUTTON, "bg-warn text-bg hover:bg-warn/90")}
          disabled={applying || manage.consent === null}
          onClick={() => void manage.apply()}
        >
          {applying ? (
            <Loader2 aria-hidden="true" className="size-3.25 animate-spin" />
          ) : (
            <Check aria-hidden="true" className="size-3.25" />
          )}
          Apply changes
        </button>
      )}
    </div>
  );
}
