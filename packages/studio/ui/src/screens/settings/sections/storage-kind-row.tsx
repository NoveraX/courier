import { Trash2, TriangleAlert } from "lucide-react";

import { KIND_INFO, type KindReport } from "@/features/storage/storage-report";
import { formatSize } from "@/lib/formatters";
import { SettingRow } from "../setting-row";

interface StorageKindRowProps {
  kind: KindReport;
  /** What the row is called, and what it is, when not the kind's own: then it counts nothing. */
  label?: string | undefined;
  what?: string | undefined;
  /** Whether the row asks to confirm its clear. */
  asking: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onClear: () => void;
}

const counted = (count: number, limit: number | undefined): string =>
  limit === undefined
    ? count.toLocaleString("en-US")
    : `${count.toLocaleString("en-US")} of the latest ${limit.toLocaleString("en-US")}`;

/**
 * One of what Studio keeps, in the Storage settings: what it is, how much
 * room it takes and how many it holds, and its Clear — which asks first,
 * saying what goes and the room it frees.
 *
 * @param props - The kind's report, whether its clear is being asked, and its actions
 * @returns The row
 * @example
 * ```tsx
 * <StorageKindRow kind={requests} asking={false} busy={false} onAsk={ask} onCancel={cancel} onClear={clear} />
 * ```
 */
export function StorageKindRow(props: StorageKindRowProps): React.ReactNode {
  const { kind, asking, busy, onAsk, onCancel, onClear } = props;
  const label = props.label ?? KIND_INFO[kind.kind].label;
  const size = formatSize(kind.bytes);
  const own = props.what === undefined;
  const description =
    props.what ?? `${KIND_INFO[kind.kind].what} · ${counted(kind.count, kind.limit)}`;
  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <span className="flex items-center gap-3">
          <span className="font-mono text-small text-fg-muted tabular-nums">{size}</span>
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            disabled={busy || kind.bytes === 0}
            onClick={onAsk}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="size-3" />
            Clear
          </button>
        </span>
      }
    >
      {asking && (
        <div
          role="alertdialog"
          aria-label={`Clear ${label.toLowerCase()}?`}
          className="flex flex-wrap items-center gap-2.5 rounded-[9px] border border-err/35 bg-err-dim px-3 py-2.5 text-control"
        >
          <TriangleAlert aria-hidden="true" className="size-3.5 text-err" />
          <span className="min-w-50 flex-1">
            {own
              ? `Delete ${label.toLowerCase()} — ${counted(kind.count, undefined)}, ${size}?`
              : `Delete ${label.toLowerCase()} Studio keeps — ${size}?`}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="h-7 cursor-pointer rounded-control border border-line-strong bg-panel px-2.5 text-small text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClear}
            className="h-7 cursor-pointer rounded-control bg-err px-3 text-small font-semibold text-bg disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      )}
    </SettingRow>
  );
}
