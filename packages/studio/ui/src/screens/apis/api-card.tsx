import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  CircleDashed,
  FileText,
  FileUp,
  GitPullRequest,
  Globe,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

import type { ApiCardView } from "@/features/apis/api-card-view";
import { cn } from "@/lib/utils";
import { ApiCardActions } from "./api-card-actions";
import { ApiQualityRows } from "./api-quality-rows";

const ORIGIN: Readonly<Record<ApiCardView["importType"], LucideIcon>> = {
  url: Globe,
  file: FileUp,
  raw: FileText,
};
const STATUS: Readonly<
  Record<ApiCardView["status"]["kind"], { icon: LucideIcon; className: string }>
> = {
  "up-to-date": { icon: CircleCheck, className: "bg-ok-dim text-ok" },
  "updates-available": { icon: CircleArrowUp, className: "bg-warn-dim text-warn" },
  checking: { icon: LoaderCircle, className: "bg-raised text-fg-muted" },
  error: { icon: CircleAlert, className: "bg-err-dim text-err" },
  unchecked: { icon: CircleDashed, className: "bg-raised text-fg-subtle" },
  none: { icon: CircleDashed, className: "bg-raised text-fg-subtle" },
};

interface ApiCardProps {
  card: ApiCardView;
  onManage: () => void;
  onCheck: () => void;
  onRemove: () => void;
}

/**
 * An imported API: where its spec came from and what the last check found,
 * its endpoints, groups and validation library, how much of it is typed,
 * what changed or went wrong, and Manage or Review update, a check for a
 * newer spec and Remove.
 *
 * @param props - The card's content, and what managing, checking and removing do
 * @returns The card
 * @example
 * ```tsx
 * <ApiCard card={apiCardView(source, status, now)} onManage={manage} onCheck={check} onRemove={remove} />
 * ```
 */
export function ApiCard({ card, onManage, onCheck, onRemove }: ApiCardProps): React.ReactNode {
  const Origin = ORIGIN[card.importType];
  const status = STATUS[card.status.kind];
  return (
    <section
      aria-label={`API ${card.name}`}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-sheet border bg-panel",
        card.update
          ? "border-warn/35 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-warn)_8%,transparent)]"
          : "border-line",
      )}
    >
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-3.5">
        <div className="flex min-w-0 items-start gap-2.75">
          <span className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] bg-brand/11 text-brand">
            <Origin aria-hidden="true" className="size-3.75" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <span className="truncate font-mono text-title font-semibold">{card.name}</span>
            <span className="truncate font-mono text-badge text-fg-subtle">{card.origin}</span>
          </div>
          <span
            className={cn(
              "flex h-5.5 shrink-0 items-center gap-1.25 rounded-full px-2 text-badge font-strong whitespace-nowrap",
              status.className,
            )}
          >
            <status.icon
              aria-hidden="true"
              className={cn("size-2.75", card.status.kind === "checking" && "animate-spin")}
            />
            {card.status.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line">
          {card.stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-0.75 bg-inset px-2.5 py-2">
              <span className="text-meta text-fg-subtle">{stat.label}</span>
              <span className="truncate font-mono text-ui font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
        <ApiQualityRows rows={card.quality} />
        {card.note && (
          <p
            className={cn(
              "m-0 flex items-center gap-2 rounded-[9px] px-2.75 py-2.25 text-small text-fg-muted",
              card.note.tone === "warn" ? "bg-warn-dim" : "bg-err-dim",
            )}
          >
            {card.note.tone === "warn" ? (
              <GitPullRequest aria-hidden="true" className="size-3.25 shrink-0 text-warn" />
            ) : (
              <TriangleAlert aria-hidden="true" className="size-3.25 shrink-0 text-err" />
            )}
            <span className="min-w-0 flex-1">{card.note.text}</span>
          </p>
        )}
      </div>
      <ApiCardActions card={card} onManage={onManage} onCheck={onCheck} onRemove={onRemove} />
    </section>
  );
}
