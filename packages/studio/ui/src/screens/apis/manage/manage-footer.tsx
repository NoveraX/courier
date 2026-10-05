import { Check, Loader2 } from "lucide-react";

import type { ReuploadState } from "@/apis/parse-raw-spec";
import { parseRawSpec } from "@/apis/parse-raw-spec";
import type { UseManageReturn } from "@/apis/use-manage";
import { cn } from "@/lib/utils";

const BUTTON =
  "flex h-8 shrink-0 cursor-pointer items-center gap-1.75 rounded-card px-3.5 text-control font-semibold disabled:cursor-default disabled:opacity-50";
const NEXT = `${BUTTON} bg-fg text-bg hover:bg-fg/90`;
const OUTLINE = `${BUTTON} border border-line font-normal text-fg-muted hover:border-line-strong hover:text-fg`;

function changesOf(manage: UseManageReturn): number {
  const count = (map: Record<string, Set<string>>) =>
    Object.values(map).reduce((n, set) => n + set.size, 0);
  return count(manage.toAdd) + count(manage.toRemove);
}

function noteOf(manage: UseManageReturn): string {
  if (manage.step === "reupload") return "The spec, again";
  if (manage.step === "inventory")
    return `${changesOf(manage)} change${changesOf(manage) === 1 ? "" : "s"} selected`;
  if (manage.step === "preview" || manage.step === "applying")
    return `${manage.consent?.plan.writes.length ?? 0} files touched`;
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
          disabled={!manage.hasChanges}
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
