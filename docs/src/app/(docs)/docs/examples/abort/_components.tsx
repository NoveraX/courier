"use client"

import { isHTTPError } from "@noverax/courier"
import { useRef, useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/caller"

export function ManualAbortDemo() {
  const controllerRef = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    type: "success" | "aborted" | "error"
    data: unknown
  } | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setResult(null)

    const controller = new AbortController()
    controllerRef.current = controller

    try {
      const data = await caller.misc.with({ signal: controller.signal }).slow()
      setResult({ type: "success", data })
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setResult({ type: "aborted", data: { message: "Request was aborted by user" } })
      } else if (isHTTPError(error)) {
        setResult({ type: "error", data: { status: error.status, message: error.message } })
      } else {
        setResult({ type: "aborted", data: { message: "Request cancelled" } })
      }
    } finally {
      setLoading(false)
      controllerRef.current = null
    }
  }

  const handleCancel = () => {
    controllerRef.current?.abort()
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <RunButton loading={loading} label="Start Slow Request" onClick={handleStart} />
        <button
          type="button"
          className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          disabled={!loading}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
      {result && (
        <ResponseViewer
          data={result.data}
          status={result.type === "success" ? 200 : result.type === "aborted" ? 499 : 500}
        />
      )}
    </>
  )
}

export function DedupDemo() {
  const abortRef = useRef<AbortController | null>(null)
  const [clickCount, setClickCount] = useState(0)
  const [abortedCount, setAbortedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)

  const handleClick = async () => {
    if (abortRef.current) {
      abortRef.current.abort()
      setAbortedCount((c) => c + 1)
    }

    const controller = new AbortController()
    abortRef.current = controller

    setClickCount((c) => c + 1)
    setLoading(true)
    setResult(null)

    try {
      const data = await caller.users.with({ signal: controller.signal }).getAll()
      setResult(data)
    } catch {
      // Aborted — ignore
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }

  const handleReset = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setClickCount(0)
    setAbortedCount(0)
    setLoading(false)
    setResult(null)
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <RunButton loading={loading} label="Fetch Users" onClick={handleClick} />
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Clicks: {clickCount}</span>
        <span>Aborted: {abortedCount}</span>
      </div>
      {result && <ResponseViewer data={result} status={200} />}
    </>
  )
}
