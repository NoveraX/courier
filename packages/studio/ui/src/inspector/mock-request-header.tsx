import { Copy, Terminal, X } from "lucide-react";

import { methodChip } from "@/design/method-color";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { MockRequestLog } from "@/store/mock-slice";

interface MockRequestHeaderProps {
  log: MockRequestLog;
  /** The mock's name, as Studio lists it. */
  server: string;
  url: string;
  curl: string;
  onClose: () => void;
}

/**
 * The head of a mock request's sheet: its method, the mock that answered
 * it, the endpoint and the address it was called at — copied on a click —
 * a way to copy it as cURL, and Close; its buttons are a finger's size on a
 * touch screen.
 *
 * @param props - The request, the mock's name, its address, its cURL, and what closes the sheet
 * @returns The head
 * @example
 * ```tsx
 * <MockRequestHeader log={log} server="shop" url={url} curl={curl} onClose={close} />
 * ```
 */
export function MockRequestHeader({
  log,
  server,
  url,
  curl,
  onClose,
}: MockRequestHeaderProps): React.ReactNode {
  const method = log.httpMethod.toUpperCase();
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.75">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex h-5 items-center rounded-[5px] px-1.5 font-mono text-meta font-semibold",
              methodChip(method),
            )}
          >
            {method}
          </span>
          <span className="ml-0.5 text-label text-fg-subtle">answered by the mock {server}</span>
        </div>
        <h2 className="m-0 truncate font-mono text-heading font-medium tracking-[-0.015em]">
          <span className="text-fg-subtle">{log.group}.</span>
          {log.endpoint}
        </h2>
        <button
          type="button"
          title="Copy URL"
          onClick={() => void copyToClipboard(url, "the URL")}
          className="hit-area relative flex min-w-0 cursor-copy items-center gap-1.5 text-left text-fg-subtle transition-colors hover:text-fg-muted"
        >
          <span className="truncate font-mono text-label">{url}</span>
          <Copy aria-hidden="true" className="size-2.75 shrink-0" />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          title="Copy as cURL"
          onClick={() => void copyToClipboard(curl, "as cURL")}
          className="flex h-7 w-7.5 cursor-pointer items-center justify-center rounded-card border border-line bg-panel-subtle text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:size-9"
        >
          <Terminal aria-hidden="true" className="size-3.25" />
        </button>
        <button
          type="button"
          title="Close · Esc"
          aria-label="Close the request"
          onClick={onClose}
          className="flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-brand pointer-coarse:size-9"
        >
          <X aria-hidden="true" className="size-3.75" />
        </button>
      </div>
    </div>
  );
}
