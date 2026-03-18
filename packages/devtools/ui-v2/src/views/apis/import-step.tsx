import { useState } from "react";
import { Globe, FileText, Upload } from "lucide-react";

import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { ImportSource } from "./types";

interface ImportStepProps {
  source: ImportSource;
  content: string;
  error: string | null;
  onSourceChange: (source: ImportSource) => void;
  onContentChange: (content: string) => void;
}

const SOURCE_OPTIONS: Array<{
  value: ImportSource;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "url", label: "URL", icon: Globe },
  { value: "file", label: "File", icon: Upload },
  { value: "raw", label: "Paste", icon: FileText },
];

export function ImportStepView({
  source,
  content,
  error,
  onSourceChange,
  onContentChange,
}: ImportStepProps): React.ReactElement {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="text-h3 text-foreground">Import API Specification</h3>
        <p className="text-body-sm text-muted-foreground">
          Provide an OpenAPI 3.x, Swagger 2.0, or Postman collection to generate typed API code.
        </p>
      </div>

      {/* Source toggle */}
      <div className="flex gap-1.5 rounded-lg border border-border-subtle bg-muted/40 p-1">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSourceChange(opt.value)}
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

      {source === "url" && (
        <Input
          placeholder="https://petstore.swagger.io/v2/swagger.json"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className="h-9 font-mono text-xs"
        />
      )}

      {source === "file" && (
        <FileDropzone
          fileName={fileName}
          onFile={(text, name) => { onContentChange(text); setFileName(name); }}
          onClear={() => { onContentChange(""); setFileName(null); }}
        />
      )}

      {source === "raw" && (
        <Textarea
          placeholder="Paste OpenAPI/Swagger JSON or YAML here…"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className="min-h-45 font-mono text-xs resize-none"
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
