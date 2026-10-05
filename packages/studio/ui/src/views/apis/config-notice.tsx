import { AlertTriangle, CircleAlert } from "lucide-react";
import type { ConfigNoticeState } from "@/features/apis/apis-page-state";
import { formatClockTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface ConfigNoticeProps {
  notice: ConfigNoticeState;
}

/**
 * Tell why the sources on the APIs page may not match the config on disk:
 * it does not load (with the loader's message), or it was deleted. Either
 * way, Studio shows what it loaded at the time given.
 *
 * @param props - The notice from `apisPageState`
 * @returns The inline alert
 *
 * @example
 * ```tsx
 * {page.kind === "sources" && page.notice && <ConfigNotice notice={page.notice} />}
 * ```
 */
export function ConfigNotice({ notice }: ConfigNoticeProps): React.ReactElement {
  const failed = notice.tone === "error";
  const Icon = failed ? CircleAlert : AlertTriangle;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-body-sm",
        failed ? "border-rose-500/20 bg-rose-500/5" : "border-amber-500/20 bg-amber-500/5",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-3.5 shrink-0", failed ? "text-rose-400" : "text-amber-400")}
      />
      <div className="min-w-0 space-y-0.5">
        <p className="break-words text-foreground/80">
          <span className="font-medium">{notice.configFile}</span>
          {notice.tone === "error" ? ` does not load: ${notice.message}` : " was deleted"}
        </p>
        <p className="text-muted-foreground">
          Showing what Studio loaded at {formatClockTime(notice.lastGoodAt)}.
        </p>
      </div>
    </div>
  );
}
