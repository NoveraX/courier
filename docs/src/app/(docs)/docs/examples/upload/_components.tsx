"use client"

import { useRef, useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/caller"

function useFilePicker() {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) setFile(droppedFile)
  }

  const dropZoneProps = {
    className: `border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
      dragOver
        ? "border-primary bg-primary/5"
        : "border-muted-foreground/25 hover:border-muted-foreground/50"
    }`,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(true)
    },
    onDragLeave: () => setDragOver(false),
    onDrop: handleDrop,
    onClick: () => inputRef.current?.click(),
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) setFile(f)
      }}
    />
  )

  return { file, setFile, dropZoneProps, fileInput, formatSize }
}

export function SimpleUploadDemo() {
  const { file, dropZoneProps, fileInput, formatSize } = useFilePicker()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("description", "Uploaded via nexus demo")

      const response = await caller.files.upload(formData)
      setResult(response)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div {...dropZoneProps}>
        {fileInput}
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size)} &middot; {file.type || "unknown type"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
        )}
      </div>

      {file && (
        <div className="mt-4">
          <RunButton loading={loading} label="Upload" onClick={handleUpload} />
        </div>
      )}

      {error && <ResponseViewer error={error} />}
      {result && <ResponseViewer data={result} status={200} />}
    </>
  )
}

export function ProgressUploadDemo() {
  const { file, dropZoneProps, fileInput, formatSize } = useFilePicker()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setProgress(0)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("description", "Uploaded via nexus demo")

      const response = await caller.files
        .with({
          onUploadProgress: (p) => {
            const pct = Math.round(p.percent * 100)
            setProgress(pct)
            if (barRef.current) barRef.current.style.width = `${pct}%`
            if (labelRef.current) labelRef.current.textContent = `${pct}%`
          },
        })
        .upload(formData)

      setResult(response)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div {...dropZoneProps}>
        {fileInput}
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size)} &middot; {file.type || "unknown type"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
        )}
      </div>

      {file && (
        <div className="mt-4 space-y-3">
          {(loading || progress > 0) && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{loading ? "Uploading..." : "Complete"}</span>
                <span ref={labelRef}>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  ref={barRef}
                  className="h-full rounded-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <RunButton loading={loading} label="Upload with Progress" onClick={handleUpload} />
          <p className="text-xs text-muted-foreground">
            Tip: On localhost uploads are nearly instant. Use browser DevTools Network throttling (e.g.
            &quot;Slow 3G&quot;) to see gradual progress.
          </p>
        </div>
      )}

      {error && <ResponseViewer error={error} />}
      {result && <ResponseViewer data={result} status={200} />}
    </>
  )
}
