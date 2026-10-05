import { Download, Scissors } from "lucide-react";

import { formatSize } from "@/lib/formatters";

interface CutNoteProps {
  /** The size in bytes of the whole body. */
  bytes: number;
  /** Downloads the whole body, when it can be had. */
  onWhole?: (() => void) | undefined;
  /** The file a snippet reads the whole body from, when the note stands over one. */
  file?: string | undefined;
}

/**
 * What a body too large to show whole says above the part shown: how large
 * the whole is, that each part left out is named where it was, and — where
 * the whole can be had — a way to download it. Over a snippet that reads the
 * body from a file, it names the file the download saves.
 *
 * @param props - The whole body's size, and what downloads it
 * @returns The note
 * @example
 * ```tsx
 * <CutNote bytes={3_821_455} onWhole={() => void downloadWholeBody(log, "response")} />
 * ```
 */
export function CutNote({ bytes, onWhole, file }: CutNoteProps): React.ReactNode {
  const size = formatSize(bytes);
  return (
    <div className="flex items-center gap-2.5 rounded-panel border border-line bg-panel-subtle py-2 pr-2 pl-3 text-small text-fg-muted">
      <Scissors aria-hidden="true" className="size-3.25 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1">
        {file === undefined ? (
          <>
            The whole body is {size}: this is a part of it, and each part left out is named where it
            was.
          </>
        ) : (
          <>
            The body is {size}, too large to write out: the snippet sends it from{" "}
            <code className="font-mono text-fg">{file}</code>, which Download whole saves.
          </>
        )}
      </span>
      {onWhole && (
        <button
          type="button"
          onClick={onWhole}
          className="flex h-6.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line-strong bg-panel px-2.5 text-label font-strong whitespace-nowrap text-fg-muted transition-colors hover:text-fg"
        >
          <Download aria-hidden="true" className="size-3" />
          Download whole
        </button>
      )}
    </div>
  );
}
