import type { LucideIcon } from "lucide-react";
import { ClipboardPaste, Globe, Link2, Upload } from "lucide-react";
import { useState } from "react";
import type { ImportSource } from "@/features/apis/types";
import { cn } from "@/lib/utils";
import { SpecDropzone } from "./spec-dropzone";

const SOURCES: readonly { value: ImportSource; label: string; sub: string; icon: LucideIcon }[] = [
  { value: "url", label: "From URL", sub: "Fetch a hosted spec", icon: Globe },
  { value: "file", label: "Upload file", sub: "JSON or YAML", icon: Upload },
  { value: "raw", label: "Paste", sub: "Raw spec text", icon: ClipboardPaste },
];

interface SpecSourceStepProps {
  source: ImportSource;
  content: string;
  error: string | null;
  onSourceChange: (source: ImportSource) => void;
  onContentChange: (content: string) => void;
}

/**
 * The Import step: where the spec comes from — a URL, a file or a paste —
 * and the spec itself, with why Studio could not read it when it could
 * not.
 *
 * @param props - Where the spec comes from, the spec, Studio's error, and what changing them does
 * @returns The step
 * @example
 * ```tsx
 * <SpecSourceStep source="url" content={url} error={null} onSourceChange={setSource} onContentChange={setContent} />
 * ```
 */
export function SpecSourceStep({
  source,
  content,
  error,
  onSourceChange,
  onContentChange,
}: SpecSourceStepProps): React.ReactNode {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-title font-semibold">Where is your spec?</h3>
        <p className="m-0 text-control text-fg-muted">
          OpenAPI 3.x, Swagger 2.0 or a Postman collection.
        </p>
      </div>
      <fieldset
        aria-label="Spec source"
        className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0"
      >
        {SOURCES.map((option) => {
          const on = option.value === source;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onSourceChange(option.value)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-2 rounded-[11px] border p-3 text-left hover:border-line-strong",
                on ? "border-brand bg-brand-tint" : "border-line bg-inset",
              )}
            >
              <option.icon
                aria-hidden="true"
                className={cn("size-4", on ? "text-brand" : "text-fg-subtle")}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-ui font-semibold">{option.label}</span>
                <span className="text-label text-fg-subtle">{option.sub}</span>
              </span>
            </button>
          );
        })}
      </fieldset>
      {source === "url" && (
        <label className="flex h-9.5 items-center gap-2 rounded-[9px] border border-line-strong bg-inset px-3 focus-within:border-brand">
          <Link2 aria-hidden="true" className="size-3.25 text-fg-subtle" />
          <input
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="https://api.example.com/openapi.json"
            aria-label="Spec URL"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-control text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
      )}
      {source === "file" && (
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
      )}
      {source === "raw" && (
        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder='{ "openapi": "3.1.0", … }'
          aria-label="Spec text"
          spellCheck={false}
          className="h-37.5 resize-y rounded-panel border border-line-strong bg-inset p-3 font-mono text-small leading-[1.6] text-syntax-plain outline-none focus:border-brand"
        />
      )}
      {error && (
        <p role="alert" className="m-0 rounded-panel bg-err-dim px-3 py-2.5 text-control text-err">
          {error}
        </p>
      )}
    </div>
  );
}
