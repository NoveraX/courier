"use client"

import { isHTTPError } from "@noverax/nexus"
import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/query"

export function TimeoutDemo() {
  const [timeoutMs, setTimeoutMs] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    type: "success" | "timeout"
    data: unknown
    elapsed: number
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setResult(null)
    const start = Date.now()

    try {
      const data = await caller("api", { timeout: timeoutMs })("misc:slow")
      setResult({ type: "success", data, elapsed: Date.now() - start })
    } catch (error: unknown) {
      const elapsed = Date.now() - start
      if (isHTTPError(error)) {
        setResult({
          type: "timeout",
          data: { status: error.status, message: error.message, data: error.data },
          elapsed,
        })
      } else if (error instanceof Error) {
        setResult({
          type: "timeout",
          data: { message: error.message, name: error.name },
          elapsed,
        })
      } else {
        setResult({ type: "timeout", data: { message: "Request timed out" }, elapsed })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(Number(e.target.value))}
        >
          <option value={1000}>1s timeout</option>
          <option value={2000}>2s timeout</option>
          <option value={5000}>5s timeout (will succeed)</option>
        </select>
        <RunButton loading={loading} label="Fetch /slow" onClick={handleClick} />
      </div>
      {result && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Elapsed: {result.elapsed}ms</p>
          <ResponseViewer
            data={result.data}
            status={result.type === "success" ? 200 : 408}
            responseTime={result.elapsed}
          />
        </div>
      )}
    </>
  )
}
