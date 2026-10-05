"use client"

import { useState } from "react"

import { caller } from "@/lib/caller"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { FileDrop } from "./file-drop"

function formOf(file: File): FormData {
  const form = new FormData()
  form.append("file", file)
  form.append("description", "Uploaded from the Courier docs")
  return form
}

function useUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const run = async (send: (form: FormData) => Promise<unknown>) => {
    if (!file) return
    setLoading(true)
    setError(undefined)
    setResult(undefined)
    try {
      setResult(await send(formOf(file)))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }
  return { file, setFile, loading, result, error, run }
}

export function SimpleUploadDemo() {
  const upload = useUpload()
  return (
    <Sandbox
      label="caller.files.upload"
      controls={
        <>
          <FileDrop file={upload.file} onFile={upload.setFile} />
          <RunButton
            loading={upload.loading}
            disabled={!upload.file}
            label="Upload"
            onClick={() => void upload.run((form) => caller.files.upload(form))}
          />
        </>
      }
      result={<ResponseView data={upload.result} error={upload.error} pending={upload.loading} />}
    />
  )
}

export function ProgressUploadDemo() {
  const upload = useUpload()
  const [percent, setPercent] = useState(0)
  return (
    <Sandbox
      label="caller.files.with({ onUploadProgress }).upload"
      controls={
        <>
          <FileDrop file={upload.file} onFile={upload.setFile} />
          {(upload.loading || percent > 0) && (
            <div>
              <div className="mb-1.5 flex justify-between font-mono text-[11px] text-fg-subtle">
                <span>{upload.loading ? "uploading" : "done"}</span>
                <span>{percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}
          <RunButton
            loading={upload.loading}
            disabled={!upload.file}
            label="Upload with progress"
            onClick={() => {
              setPercent(0)
              void upload.run((form) =>
                caller.files
                  .with({ onUploadProgress: (p) => setPercent(Math.round(p.percent * 100)) })
                  .upload(form)
              )
            }}
          />
          <p className="m-0 text-[11.5px] leading-[1.5] text-fg-subtle">
            On localhost an upload is near instant: throttle the network in DevTools to watch it
            climb.
          </p>
        </>
      }
      result={<ResponseView data={upload.result} error={upload.error} pending={upload.loading} />}
    />
  )
}
