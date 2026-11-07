"use client"

import { smoothProgress } from "@noverax/courier"
import Link from "next/link"
import { useState } from "react"

import { caller } from "@/lib/caller"
import { RequestInspector } from "@/site/inspector/request-inspector"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { DEMO_LIMITS, uploadRequestBytes } from "../../../../../server/limits"
import { FileDrop } from "./file-drop"
import { ProgressBars } from "./progress-bars"

function formOf(file: File): FormData {
  const form = new FormData()
  form.append("file", file)
  form.append("description", "Uploaded from the Courier docs")
  return form
}

/* A file half a megabyte past all the site's proxy route takes of an upload, made in memory: the
   route refuses it before it calls the API. */
function overTheLimit(): FormData {
  const bytes = new Uint8Array(uploadRequestBytes(DEMO_LIMITS) + 512 * 1024)
  return formOf(new File([bytes], "over-the-limit.bin", { type: "application/octet-stream" }))
}

function useUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const settle = async (upload: () => Promise<unknown>) => {
    setLoading(true)
    setError(undefined)
    setResult(undefined)
    try {
      setResult(await upload())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Upload failed")
    } finally {
      setLoading(false)
    }
  }
  const run = async (send: (form: FormData) => Promise<unknown>) => {
    if (file) await settle(() => send(formOf(file)))
  }
  return { file, setFile, loading, result, error, run, settle }
}

const UPLOADS = ["api.files.upload"]

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
          <RunButton
            variant="secondary"
            loading={upload.loading}
            label="Send one over the limit"
            onClick={() => void upload.settle(() => caller.files.upload(overTheLimit()))}
          />
        </>
      }
      result={<ResponseView data={upload.result} error={upload.error} pending={upload.loading} />}
      inspector={<RequestInspector calls={UPLOADS} />}
    />
  )
}

export function ProgressUploadDemo() {
  const upload = useUpload()
  const [reported, setReported] = useState(0)
  const [smoothed, setSmoothed] = useState(0)
  return (
    <Sandbox
      label="caller.files.with({ onUploadProgress }).upload"
      controls={
        <>
          <FileDrop file={upload.file} onFile={upload.setFile} />
          {(upload.loading || reported > 0) && (
            <ProgressBars reported={reported} smoothed={smoothed} />
          )}
          <RunButton
            loading={upload.loading}
            disabled={!upload.file}
            label="Upload with progress"
            onClick={() => {
              setReported(0)
              setSmoothed(0)
              const smooth = smoothProgress(({ percent }) => setSmoothed(percent * 100))
              void upload.run((form) =>
                caller.files
                  .with({
                    onUploadProgress: (progress) => {
                      setReported(progress.percent * 100)
                      smooth(progress)
                    },
                  })
                  .upload(form)
              )
            }}
          />
          <p className="m-0 text-[11.5px] leading-[1.5] text-fg-subtle">
            Both bars follow the same upload. On localhost it is near instant: throttle the network
            in DevTools, or{" "}
            <Link
              href="/docs/advanced/upload#a-bar-that-moves-smoothly"
              className="text-brand hover:underline"
            >
              send one in the upload guide's lab
            </Link>
            , which reads it at the pace you pick.
          </p>
        </>
      }
      result={<ResponseView data={upload.result} error={upload.error} pending={upload.loading} />}
      inspector={<RequestInspector calls={UPLOADS} />}
    />
  )
}
