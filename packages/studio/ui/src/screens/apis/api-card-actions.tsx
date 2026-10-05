import { GitCompare, RefreshCw, Settings2, Trash2 } from "lucide-react";

import type { ApiCardView } from "@/features/apis/api-card-view";
import { cn } from "@/lib/utils";

interface ApiCardActionsProps {
  card: ApiCardView;
  onManage: () => void;
  onCheck: () => void;
  onRemove: () => void;
}

/**
 * The foot of an imported API's card: Manage — or Review update when a
 * newer spec is published — when it was last checked, a check for a newer
 * spec (off, with the reason, when there is nowhere to check) and Remove.
 *
 * @param props - The card's content, and what managing, checking and removing do
 * @returns The actions
 * @example
 * ```tsx
 * <ApiCardActions card={card} onManage={manage} onCheck={check} onRemove={remove} />
 * ```
 */
export function ApiCardActions({
  card,
  onManage,
  onCheck,
  onRemove,
}: ApiCardActionsProps): React.ReactNode {
  return (
    <div className="mt-auto flex items-center gap-1.5 border-t border-line bg-panel-subtle px-3 py-2.5">
      <button
        type="button"
        onClick={onManage}
        className={cn(
          "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-2.5 text-small font-semibold whitespace-nowrap",
          card.update
            ? "bg-warn text-bg hover:bg-warn/90"
            : "border border-line-strong bg-panel text-fg hover:bg-raised",
        )}
      >
        {card.update ? (
          <GitCompare aria-hidden="true" className="size-3" />
        ) : (
          <Settings2 aria-hidden="true" className="size-3" />
        )}
        {card.update ? "Review update" : "Manage"}
      </button>
      <div className="flex-1" />
      <span className="min-w-0 truncate text-badge text-fg-subtle">{card.checked}</span>
      <button
        type="button"
        onClick={onCheck}
        disabled={!card.check.can || card.status.kind === "checking"}
        title={card.check.can ? "Check for updates" : card.check.why}
        aria-label={`Check ${card.name} for updates`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
      >
        <RefreshCw aria-hidden="true" className="size-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        aria-label={`Remove ${card.name}`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-err-dim hover:text-err"
      >
        <Trash2 aria-hidden="true" className="size-3.25" />
      </button>
    </div>
  );
}
