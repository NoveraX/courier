import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  CircleDashed,
  Eye,
  FileText,
  FileUp,
  GitCompare,
  GitPullRequest,
  Globe,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";

import type { ApiCardView, QualityRow } from "@/features/apis/api-card-view";
import { cn } from "@/lib/utils";

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
const TONE = {
  ok: { bar: "bg-ok", icon: "text-ok", count: "text-fg-muted" },
  warn: { bar: "bg-warn", icon: "text-warn", count: "text-warn" },
  subtle: { bar: "bg-fg-subtle", icon: "text-fg-subtle", count: "text-fg-subtle" },
} as const;

function qualityIcon(row: QualityRow): LucideIcon {
  if (row.kind === "response") return Eye;
  if (row.kind === "variables") return Zap;
  return row.tone === "ok" ? ShieldCheck : ShieldAlert;
}

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
        <div className="flex flex-col gap-2">
          {card.quality.map((row) => {
            const tone = TONE[row.tone];
            const Icon = qualityIcon(row);
            return (
              <div
                key={row.kind}
                title={row.tip}
                className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2.5"
              >
                <span className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted">
                  <Icon aria-hidden="true" className={cn("size-2.75", tone.icon)} />
                  {row.label}
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-raised">
                  <span
                    className={cn("block h-full rounded-full", tone.bar)}
                    style={{ width: `${row.total ? (row.count / row.total) * 100 : 0}%` }}
                  />
                </span>
                <span
                  className={cn("text-right font-mono text-badge", tone.count)}
                >{`${row.count}/${row.total}`}</span>
              </div>
            );
          })}
        </div>
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
    </section>
  );
}
