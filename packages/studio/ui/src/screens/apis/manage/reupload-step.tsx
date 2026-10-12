import type { LucideIcon } from "lucide-react";
import { ClipboardPaste, Upload } from "lucide-react";
import { useState } from "react";

import type { ReuploadState } from "@/apis/parse-raw-spec";
import { cn } from "@/lib/utils";
import { SpecDropzone } from "../import/spec-dropzone";

const SOURCES: readonly { value: "file" | "raw"; label: string; icon: LucideIcon }[] = [
  { value: "file", label: "Upload file", icon: Upload },
  { value: "raw", label: "Paste", icon: ClipboardPaste },
];

/**
 * The Spec step of an import from a file or a paste: its spec again, to
 * see every endpoint it offers now.
 *
 * @param props - The spec typed or read so far and what changing it does
 * @returns The step
 * @example
 * ```tsx
 * <ReuploadStep state={reupload} onContentChange={setContent} />
 * ```
 */
export function ReuploadStep({
  state,
  onContentChange,
}: {
  state: ReuploadState;
  onContentChange: (content: string) => void;
}): React.ReactNode {
  const [source, setSource] = useState<"file" | "raw">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-control text-fg-muted">
        This import came from a file or a paste, so Studio has no URL to read its spec from. Give it
        the spec again to see every endpoint it offers now.
      </p>
      <fieldset aria-label="Spec source" className="m-0 flex min-w-0 gap-2 border-0 p-0">
        {SOURCES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === source}
            onClick={() => setSource(option.value)}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.75 rounded-card border px-3 text-control pointer-coarse:h-10",
              option.value === source
                ? "border-brand bg-brand-tint text-fg"
                : "border-line text-fg-muted hover:border-line-strong",
            )}
          >
            <option.icon aria-hidden="true" className="size-3.25" />
            {option.label}
          </button>
        ))}
      </fieldset>
      {source === "file" ? (
        <SpecDropzone
          fileName={fileName}
          onFile={(text, name) => {
            onContentChange(text);
            setFileName(name);
          }}
          onClear={() => {
            onContentChange("");
            setFileName(null);
          }}
        />
      ) : (
        <textarea
          value={state.content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder='{ "openapi": "3.1.0", … }'
          aria-label="Spec text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-37.5 resize-y rounded-panel border border-line-strong bg-inset p-3 font-mono text-small leading-[1.6] text-syntax-plain outline-none focus:border-brand pointer-coarse:text-[16px]"
        />
      )}
      {state.error && (
        <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          {state.error}
        </p>
      )}
    </div>
  );
}
