import { Check, Copy, FileCode, Lock, Shield } from "lucide-react"
import { useMemo, useState } from "react"

import type { MergeStatus, UpdateFileResult } from "./types"

const STATUS_STYLE: Record<MergeStatus, { color: string; bg: string; label: string }> = {
  safe: { color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Safe" },
  merged: { color: "text-amber-400", bg: "bg-amber-500/10", label: "Merged" },
  conflict: { color: "text-red-400", bg: "bg-red-500/10", label: "Conflict" },
}

export function UpdateDiffPreview({ files, activeIdx, onSelect }: {
  files: UpdateFileResult[]
  activeIdx: number
  onSelect: (i: number) => void
}) {
  const file = files[activeIdx]
  if (!file) return null

  return (
    <div className="flex h-full gap-3">
      <FileList files={files} activeIdx={activeIdx} onSelect={onSelect} />
      <FilePreview file={file} />
    </div>
  )
}

function FileList({ files, activeIdx, onSelect }: {
  files: UpdateFileResult[]; activeIdx: number; onSelect: (i: number) => void
}) {
  return (
    <div className="w-56 shrink-0 space-y-1 overflow-auto rounded-lg border border-border-default bg-surface-0 p-2">
      {files.map((f, i) => {
        const cfg = STATUS_STYLE[f.status]
        const shortPath = f.path.split("/").slice(-2).join("/")
        const preserved = f.changes.filter((c) => c.type === "preserved").length

        return (
          <button key={f.path} type="button" onClick={() => onSelect(i)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${i === activeIdx ? "bg-indigo-500/15 text-indigo-400" : "text-text-muted hover:bg-surface-1 hover:text-text-secondary"}`}>
            <FileCode size={12} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={f.path}>{shortPath}</span>
            {preserved > 0 && <span title={`${preserved} preserved`}><Lock size={9} className="shrink-0 text-amber-400" /></span>}
            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilePreview({ file }: { file: UpdateFileResult }) {
  const [copied, setCopied] = useState(false)
  const cfg = STATUS_STYLE[file.status]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border-default bg-surface-0">
      <FileHeader file={file} cfg={cfg} copied={copied} onCopy={handleCopy} />
      {file.changes.length > 0 && <ChangesList changes={file.changes} />}
      <CodeBlock content={file.content} />
    </div>
  )
}

function FileHeader({ file, cfg, copied, onCopy }: {
  file: UpdateFileResult; cfg: { color: string; bg: string; label: string }; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
      <div className="flex items-center gap-2">
        <FileCode size={14} className="text-text-muted" />
        <span className="text-xs font-medium text-text-primary">{file.path}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
          {file.status === "safe" && <Shield size={9} className="mr-0.5 inline" />}
          {cfg.label}
        </span>
      </div>
      <button type="button" onClick={onCopy} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-1">
        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

function ChangesList({ changes }: { changes: UpdateFileResult["changes"] }) {
  const typeColors = { added: "text-emerald-400", removed: "text-red-400", updated: "text-amber-400", preserved: "text-sky-400" }

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border-default px-3 py-2">
      {changes.map((c, i) => (
        <span key={i} className={`rounded bg-surface-2 px-1.5 py-0.5 text-[10px] ${typeColors[c.type]}`} title={c.detail}>
          {c.type}: {c.target}
        </span>
      ))}
    </div>
  )
}

function CodeBlock({ content }: { content: string }) {
  const lines = useMemo(() => content.split("\n"), [content])

  return (
    <div className="flex-1 overflow-auto">
      <pre className="p-3 text-xs leading-5">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-4 inline-block w-8 shrink-0 select-none text-right text-text-muted opacity-40">{i + 1}</span>
            <code className="text-text-primary">{line}</code>
          </div>
        ))}
      </pre>
    </div>
  )
}
