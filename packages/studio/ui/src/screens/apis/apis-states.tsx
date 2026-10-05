import { CircleAlert, Copy, TriangleAlert } from "lucide-react";

import { CodeLines } from "@/design/code/code-lines";
import type { ConfigNoticeState } from "@/features/apis/apis-page-state";
import { MINIMAL_CONFIG } from "@/features/apis/minimal-config";
import { copyToClipboard } from "@/lib/clipboard";
import { formatClockTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function Centered({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="mx-auto flex max-w-130 flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="text-heading font-semibold">{title}</h2>
      {children}
    </div>
  );
}

/**
 * The APIs page while there is no config: where to start, and a minimal
 * config to copy.
 *
 * @returns The state
 * @example
 * ```tsx
 * <NoConfig />
 * ```
 */
export function NoConfig(): React.ReactNode {
  return (
    <Centered title="No courier.config.ts">
      <p className="text-control text-fg-subtle">
        Create courier.config.ts at the project root. Studio loads it as soon as it is saved, and
        Import API turns on.
      </p>
      <div className="w-full overflow-hidden rounded-[11px] border border-line bg-inset text-left">
        <CodeLines code={MINIMAL_CONFIG} variant="panel" />
      </div>
      <button
        type="button"
        onClick={() => void copyToClipboard(MINIMAL_CONFIG, "config")}
        className="flex h-8 cursor-pointer items-center gap-1.75 rounded-card border border-line px-3 text-control text-fg-muted hover:border-line-strong hover:text-fg"
      >
        <Copy aria-hidden="true" className="size-3.25" />
        Copy config
      </button>
    </Centered>
  );
}

/**
 * The APIs page when the config never loaded, or when it declares no
 * sources yet.
 *
 * @param props - What went wrong, or nothing for a config without sources
 * @returns The state
 * @example
 * ```tsx
 * <NoSources broken={{ configFile: "courier.config.ts", message }} />
 * ```
 */
export function NoSources({
  broken,
}: {
  broken?: { configFile: string; message: string } | undefined;
}): React.ReactNode {
  if (broken) {
    return (
      <Centered title={`${broken.configFile} does not load`}>
        <p className="font-mono text-small whitespace-pre-wrap text-err">{broken.message}</p>
      </Centered>
    );
  }
  return (
    <Centered title="No APIs yet">
      <p className="text-control text-fg-subtle">
        Studio lists the APIs courier.config declares under sources. Write one by hand, or import an
        OpenAPI, Swagger or Postman spec to generate one.
      </p>
    </Centered>
  );
}

/**
 * The config's last load failed or the file was deleted: what the page
 * shows is what Studio loaded before.
 *
 * @param props - The notice
 * @returns The notice
 * @example
 * ```tsx
 * <ConfigNoticeBar notice={page.notice} />
 * ```
 */
export function ConfigNoticeBar({ notice }: { notice: ConfigNoticeState }): React.ReactNode {
  const failed = notice.tone === "error";
  const Icon = failed ? CircleAlert : TriangleAlert;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-panel px-3 py-2.5 text-control",
        failed ? "bg-err-dim" : "bg-warn-dim",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-3.5 shrink-0", failed ? "text-err" : "text-warn")}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="m-0 break-words text-fg">
          <span className="font-strong">{notice.configFile}</span>
          {notice.tone === "error" ? ` does not load: ${notice.message}` : " was deleted"}
        </p>
        <p className="m-0 text-small text-fg-subtle">
          Showing what Studio loaded at {formatClockTime(notice.lastGoodAt)}.
        </p>
      </div>
    </div>
  );
}
