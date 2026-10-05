"use client"

import { Upload } from "lucide-react"
import { useRef, useState } from "react"

import { cn } from "@/site/cn"

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Where a file to upload is dropped or picked: the file's name, size and
 * type once there is one.
 *
 * @param props - The file picked, and what picking one does
 * @returns The drop zone
 * @example
 * ```tsx
 * <FileDrop file={file} onFile={setFile} />
 * ```
 */
export function FileDrop({ file, onFile }: { file: File | null; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) onFile(dropped)
      }}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-control border border-dashed px-3 py-5 text-center transition-colors",
        over ? "border-brand bg-brand-dim" : "border-line-strong hover:border-fg-subtle"
      )}
    >
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onFile(picked)
        }}
      />
      <Upload aria-hidden="true" className="size-4 text-fg-subtle" />
      {file ? (
        <>
          <span className="max-w-full truncate text-control font-medium text-fg">{file.name}</span>
          <span className="font-mono text-[11px] text-fg-subtle">
            {sizeOf(file.size)} · {file.type || "unknown type"}
          </span>
        </>
      ) : (
        <span className="text-control text-fg-subtle">Drop a file, or pick one</span>
      )}
    </button>
  )
}
