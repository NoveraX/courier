"use client"

import { isHTTPError } from "@noverax/nexus"
import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller } from "@/lib/caller"

const ERROR_CODES = [400, 401, 403, 404, 422, 500, 502, 503] as const

export function CatchDemo() {
  const [selectedCode, setSelectedCode] = useState<number>(404)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{
    name: string
    status: number
    message: string
    data: unknown
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      await caller.misc.error({ code: selectedCode })
    } catch (e: unknown) {
      if (isHTTPError(e)) {
        setError({
          name: e.name,
          status: e.status,
          message: e.message,
          data: e.data,
        })
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
          value={selectedCode}
          onChange={(e) => setSelectedCode(Number(e.target.value))}
        >
          {ERROR_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <RunButton loading={loading} label={`Trigger ${selectedCode}`} onClick={handleClick} />
      </div>
      {error && <ResponseViewer data={error} status={error.status} />}
    </>
  )
}

export function GuardDemo() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    isHttpError: boolean
    status?: number
    data?: unknown
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setResult(null)
    try {
      await caller.misc.error({ code: 403 })
    } catch (error: unknown) {
      if (isHTTPError(error)) {
        setResult({
          isHttpError: true,
          status: error.status,
          data: error.data,
        })
      } else {
        setResult({ isHttpError: false })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <RunButton loading={loading} label="Trigger 403" onClick={handleClick} />
      {result && <ResponseViewer data={result} status={result.status ?? 500} />}
    </>
  )
}
