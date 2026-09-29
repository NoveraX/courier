import { AlertTriangle } from "lucide-react";
import { formatClockTime } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { configFileName } from "@/store/config-file-name";
import type { ConfigStatusPayload } from "@/store/config-status";

interface ConfigChipState {
  label: string;
  title: string;
  failed: boolean;
}

/**
 * Tell in the status bar, on every page, that Studio does not run the config
 * on disk: "config error" while it does not load, "config deleted" once it is
 * gone after Studio ran it. The details are its title. A project that never
 * had a config gets no chip: the APIs page says so.
 *
 * @returns The chip, or nothing while the config loads
 *
 * @example
 * ```tsx
 * <ConfigChip />
 * ```
 */
export function ConfigChip(): React.ReactNode {
  const status = useStudioStore((s) => s.configStatus);
  const chip = chipOf(status);
  if (!chip) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={chip.title}
      title={chip.title}
      className={cn(
        "inline-flex items-center gap-1",
        chip.failed ? "text-rose-400" : "text-amber-400",
      )}
    >
      <AlertTriangle className="size-2.5" aria-hidden="true" />
      <span>{chip.label}</span>
    </span>
  );
}

function chipOf(status: ConfigStatusPayload | null): ConfigChipState | null {
  const file = configFileName(status);
  if (status?.state === "failed") {
    return {
      label: "config error",
      title: `${file} does not load: ${status.error.message}`,
      failed: true,
    };
  }
  if (status?.state !== "missing" || status.lastGoodAt === null) return null;
  return {
    label: "config deleted",
    title: `${file} was deleted; Studio runs what it loaded at ${formatClockTime(status.lastGoodAt)}`,
    failed: false,
  };
}
