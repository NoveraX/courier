import { Database, Minimize2 } from "lucide-react";
import { useState } from "react";

import { Segmented } from "@/design/segmented";
import { STORAGE_KINDS, type StorageKind } from "@/features/storage/storage-report";
import { formatSize } from "@/lib/formatters";
import type { SettingsDraft } from "@/settings/use-settings-draft";
import type { StorageControls } from "@/settings/use-storage";
import { STORAGE_WARNINGS } from "../setting-options";
import { SettingRow } from "../setting-row";
import { SettingSection } from "../setting-section";
import { StorageKindRow } from "./storage-kind-row";

interface StorageSectionProps {
  settings: SettingsDraft;
  storage: StorageControls;
  /** What the page does once kinds are cleared, besides showing the new sizes. */
  onCleared?: ((kinds: readonly StorageKind[]) => void) | undefined;
}

/* The database's line: where it is, its size on disk, and the data in it. */
function databaseLine({ report }: StorageControls): string {
  if (!report) return "Measuring…";
  if (!report.persistent) return "Kept in memory for this run: nothing is on disk";
  const { onDisk, data } = report.database;
  return `${report.folder}/studio.db · ${formatSize(onDisk)} on disk, ${formatSize(data)} of data`;
}

/**
 * The Storage settings: what Studio keeps in `.courier/` and the room each
 * part takes, a Clear for each and one for everything — each asks first —
 * a compaction that gives the disk back the room freed inside the database,
 * and the size past which the page says the database has grown large.
 *
 * @param props - The settings draft, and Studio's storage with its controls
 * @returns The section
 * @example
 * ```tsx
 * <StorageSection settings={settings} storage={useStorage()} />
 * ```
 */
export function StorageSection({
  settings,
  storage,
  onCleared,
}: StorageSectionProps): React.ReactNode {
  const [asking, setAsking] = useState<StorageKind | "all" | null>(null);
  const { report, busy } = storage;
  const clear = async (kinds: readonly StorageKind[]) => {
    if (!(await storage.clear(kinds))) return;
    setAsking(null);
    onCleared?.(kinds);
  };
  return (
    <SettingSection
      id="storage"
      label="Storage"
      description="What Studio keeps in .courier/, and the room it takes"
      icon={Database}
      tone="text-syntax-type"
    >
      <SettingRow
        label="Database"
        description={storage.error ?? databaseLine(storage)}
        control={
          <button
            type="button"
            disabled={busy || !report?.persistent || (report?.database.free ?? 0) === 0}
            onClick={() => void storage.compact()}
            title={report ? `${formatSize(report.database.free)} freed inside it` : undefined}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-small text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
          >
            <Minimize2 aria-hidden="true" className="size-3" />
            Compact
          </button>
        }
      />
      {report?.kinds.map((kind) => (
        <StorageKindRow
          key={kind.kind}
          kind={kind}
          asking={asking === kind.kind}
          busy={busy}
          onAsk={() => setAsking(kind.kind)}
          onCancel={() => setAsking(null)}
          onClear={() => void clear([kind.kind])}
        />
      ))}
      {report && (
        <StorageKindRow
          kind={{
            kind: "requests",
            bytes: report.kinds.reduce((sum, kind) => sum + kind.bytes, 0),
            count: report.kinds.reduce((sum, kind) => sum + kind.count, 0),
          }}
          label="Everything"
          what="Every part above, at once"
          asking={asking === "all"}
          busy={busy}
          onAsk={() => setAsking("all")}
          onCancel={() => setAsking(null)}
          onClear={() => void clear(STORAGE_KINDS)}
        />
      )}
      <SettingRow
        label="Warn past"
        description="The size of the database past which Studio says it has grown large"
        edited={settings.changed.has("storageWarnMb")}
        control={
          <Segmented
            label="Warn past"
            options={STORAGE_WARNINGS}
            value={String(settings.draft.storageWarnMb)}
            onChange={(mb) => settings.set("storageWarnMb", Number(mb))}
          />
        }
      />
    </SettingSection>
  );
}
