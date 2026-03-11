import { useState } from "react"
import { Copy, Download, FolderOpen, FileText, Loader2, Check } from "lucide-react"

import type { GeneratedFile } from "./types"

export function PreviewStep({
  files,
  activeFileIndex,
  loading,
  writeResult,
  onFileSelect,
  onWrite,
  onCopy,
  onDownload,
}: {
  files: GeneratedFile[]
  activeFileIndex: number
  loading: boolean
  writeResult: string | null
  onFileSelect: (i: number) => void
  onWrite: () => void
  onCopy: () => void
  onDownload: () => void
}) {
  const [copied, setCopied] = useState(false)
  const activeFile = files[activeFileIndex]

  function copyFile() {
    if (!activeFile) return
    navigator.clipboard.writeText(activeFile.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Preview</h2>
          <p className="text-xs text-text-muted">{files.length} file{files.length > 1 ? "s" : ""} generated</p>
        </div>
        <div className="flex items-center gap-2">
          {writeResult && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check size={12} /> {writeResult}
            </span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Copy size={12} /> Copy All
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2"
          >
            <Download size={12} /> Download
          </button>
          <button
            type="button"
            onClick={onWrite}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
            Write to Project
          </button>
        </div>
      </div>

      {/* File tabs + content */}
      <div className="flex flex-1 overflow-hidden rounded-lg border border-border-default">
        {/* File tabs (left) */}
        <div className="w-48 shrink-0 overflow-auto border-r border-border-default bg-surface-0">
          {files.map((file, i) => {
            const fileName = file.path.split("/").pop() ?? file.path
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onFileSelect(i)}
                className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs transition-colors ${
                  i === activeFileIndex
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:bg-surface-1 hover:text-text-secondary"
                }`}
              >
                <FileText size={12} className="shrink-0" />
                <span className="truncate font-mono">{fileName}</span>
              </button>
            )
          })}
        </div>

        {/* Code preview */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeFile && (
            <>
              <div className="flex items-center justify-between border-b border-border-subtle bg-surface-0 px-3 py-1.5">
                <span className="font-mono text-xs text-text-muted">{activeFile.path}</span>
                <button
                  type="button"
                  onClick={copyFile}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="flex-1 overflow-auto bg-surface-1 p-4 font-mono text-xs leading-5 text-text-primary">
                {activeFile.content}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
