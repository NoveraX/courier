import { FileCode2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { MEDIA } from "@/design/breakpoints";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface SpecDropzoneProps {
  fileName: string | null;
  onFile: (content: string, name: string) => void;
  onClear: () => void;
}

/**
 * Where a spec file is dropped or browsed for, read as text — on a touch
 * screen, where nothing is dropped, chosen — and once one is read, its name
 * with a way to drop it.
 *
 * @param props - The file read, if any, and what reading and dropping it do
 * @returns The drop zone
 * @example
 * ```tsx
 * <SpecDropzone fileName={name} onFile={(text, name) => read(text, name)} onClear={clear} />
 * ```
 */
export function SpecDropzone({ fileName, onFile, onClear }: SpecDropzoneProps): React.ReactNode {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const touch = useMediaQuery(MEDIA.coarse);
  const read = (file: File): void => {
    void file.text().then((text) => onFile(text, file.name));
  };
  if (fileName) {
    return (
      <div className="flex items-center gap-2.5 rounded-[11px] border border-line-strong bg-inset px-3.5 py-3">
        <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate font-mono text-control">{fileName}</span>
        <button
          type="button"
          aria-label="Choose another file"
          onClick={onClear}
          className="flex size-7 cursor-pointer items-center justify-center rounded-control text-fg-subtle hover:bg-raised hover:text-fg pointer-coarse:size-9"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) read(file);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-2 rounded-[11px] border-[1.5px] border-dashed px-4 py-7 text-center",
          dragging ? "border-brand bg-brand-tint" : "border-line-strong bg-inset",
        )}
      >
        <Upload aria-hidden="true" className="size-5 text-fg-subtle" />
        <span className="text-ui font-strong">
          {touch ? "Choose a spec file" : "Drop a spec file here"}
        </span>
        <span className="text-small text-fg-subtle">
          .json · .yaml · .yml{touch ? "" : " — or "}
          {!touch && <span className="text-brand">browse</span>}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.yaml,.yml"
        aria-label="Spec file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) read(file);
        }}
      />
    </>
  );
}
