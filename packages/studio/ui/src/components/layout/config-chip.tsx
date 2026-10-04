import { AlertTriangle } from "lucide-react";
import { configNotice } from "@/features/config/config-notice";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";

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
  const chip = configNotice(status);
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
