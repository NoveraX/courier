/**
 * Reupload step inside the manage dialog — upload file or paste spec content.
 */

import { FileText, Upload } from "lucide-react";
import { useState } from "react";

import { FileDropzone } from "@/components/ui/file-dropzone";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { parseSpecFromRaw } from "./client";
import type { ParsedSpec } from "./types";

type ReuploadSource = "file" | "raw";

export interface ReuploadStepState {
  content: string;
  parsing: boolean;
  error: string | null;
}

interface ReuploadStepProps {
  state: ReuploadStepState;
  onContentChange: (content: string) => void;
}

export function ReuploadStep({ state, onContentChange }: ReuploadStepProps): React.ReactElement {
  const [source, setSource] = useState<ReuploadSource>("file");
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-4 pt-2">
      <p className="text-body-sm text-muted-foreground">
        Upload the spec file to see all available endpoints and manage your selection.
      </p>

      <SourceToggle source={source} onChange={setSource} />

      {source === "file" && (
        <FileDropzone
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
        <Textarea
          placeholder="Paste OpenAPI/Swagger JSON or YAML…"
          value={state.content}
          onChange={(e) => onContentChange(e.target.value)}
          className="min-h-40 font-mono text-xs resize-none"
        />
      )}

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

/** Parse raw spec content and call onParsed on success */
export async function parseAndContinue(
  content: string,
  onParsed: (spec: ParsedSpec) => void,
  setState: (update: Partial<ReuploadStepState>) => void,
): Promise<void> {
  setState({ parsing: true, error: null });
  try {
    const spec = await parseSpecFromRaw(content);
    onParsed(spec);
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Failed to parse spec" });
  } finally {
    setState({ parsing: false });
  }
}

// ── Source toggle ────────────────────────────────────────────────────────────

const OPTIONS: Array<{
  value: ReuploadSource;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "file", label: "File", icon: Upload },
  { value: "raw", label: "Paste", icon: FileText },
];

function SourceToggle({
  source,
  onChange,
}: {
  source: ReuploadSource;
  onChange: (s: ReuploadSource) => void;
}): React.ReactElement {
  return (
    <div className="flex gap-1.5 rounded-lg border border-border-subtle bg-muted/40 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            source === opt.value
              ? "bg-background text-foreground shadow-sm ring-1 ring-border-subtle"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <opt.icon className="size-3" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
