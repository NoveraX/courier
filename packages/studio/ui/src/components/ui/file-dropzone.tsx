import { File, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  /** File MIME/extension filter for the native file picker */
  accept?: string;
  /** Hint text shown below the dropzone (e.g. "JSON or YAML") */
  hint?: string;
  /** Currently selected file name (controlled) */
  fileName?: string | null;
  /** Called with the file text content and name after reading */
  onFile: (content: string, name: string) => void;
  /** Called when the user removes the selected file */
  onClear: () => void;
  className?: string;
}

export function FileDropzone({
  accept = ".json,.yaml,.yml",
  hint = "JSON or YAML",
  fileName,
  onFile,
  onClear,
  className,
}: FileDropzoneProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file: globalThis.File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") onFile(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  if (fileName) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border border-dashed border-input px-4 py-3",
          className,
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-muted ring-1 ring-inset ring-border">
          <File className="size-4 text-foreground" />
        </span>
        <p className="flex-1 truncate text-xs font-medium text-foreground">{fileName}</p>
        <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={onClear}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-input",
          className,
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-8 text-muted-foreground" />
        <span className="mt-2 flex text-sm text-muted-foreground">
          <span>Drag and drop or</span>
          <span className="pl-1 font-medium text-primary">choose file</span>
        </span>
        {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        onChange={handleChange}
      />
    </>
  );
}
