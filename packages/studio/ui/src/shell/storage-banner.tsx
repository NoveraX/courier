import { Link } from "@tanstack/react-router";
import { HardDrive, X } from "lucide-react";
import { useState } from "react";

import { formatSize } from "@/lib/formatters";
import { useStudioStore } from "@/store";

/* Once dismissed, the banner comes back only after the database grows this much more. */
const GROWTH_BYTES = 100 * 1024 * 1024;

const MB = 1024 * 1024;

/**
 * A quiet line under the header once Studio's database grows past the size
 * set in Settings → Storage — Studio says how large it is as the page
 * connects, every ten minutes and after a clear — with the way to Storage,
 * where its parts can be cleared. Dismissed, it comes back only once the
 * database has grown a good deal more. On a phone the words take the line
 * and the way to Storage goes under them.
 *
 * @returns The banner, or nothing while the database is within the size set
 * @example
 * ```tsx
 * <StorageBanner />
 * ```
 */
export function StorageBanner(): React.ReactNode {
  const onDisk = useStudioStore((s) => s.databaseBytes) ?? 0;
  const warnMb = useStudioStore((s) => s.settings.storageWarnMb);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  if (onDisk <= warnMb * MB) return null;
  if (dismissedAt !== null && onDisk < dismissedAt + GROWTH_BYTES) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 animate-pop-in flex-wrap items-center gap-x-3 gap-y-2 border-b border-warn/30 bg-warn-dim py-2.25 pr-[max(20px,env(safe-area-inset-right))] pl-[max(20px,env(safe-area-inset-left))] text-control max-sm:px-4"
    >
      <span className="flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full">
        <HardDrive aria-hidden="true" className="size-3.5 shrink-0 text-warn" />
        <span className="text-fg">
          <strong className="font-semibold">Studio's database takes {formatSize(onDisk)}.</strong>{" "}
          <span className="text-fg-muted">
            That is past the {formatSize(warnMb * MB)} set to warn at.
          </span>
        </span>
      </span>
      <span className="ml-auto flex items-center gap-3">
        <Link
          to="/settings"
          hash="settings-storage"
          className="flex h-6.5 items-center rounded-control border border-line-strong bg-panel px-2.5 text-small font-strong text-fg hover:border-fg-subtle pointer-coarse:h-9"
        >
          Open Storage
        </Link>
        <button
          type="button"
          aria-label="Dismiss the storage warning"
          onClick={() => setDismissedAt(onDisk)}
          className="flex size-6.5 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:size-9"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
