"use client"

import { useState } from "react"

import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { caller, useMutation } from "@/lib/query"

export function MiddlewareDemo() {
  const { mutate, data, isPending, error } = useMutation("middlewareApi", "users:getAll")

  return (
    <>
      <RunButton
        loading={isPending}
        label="Fetch Users (with middleware)"
        onClick={() => mutate({})}
      />
      {error && <ResponseViewer error={error.message} />}
      {data && <ResponseViewer data={data} status={200} />}
    </>
  )
}

export function OnErrorDemo() {
  const [loading, setLoading] = useState(false)
  const [caughtError, setCaughtError] = useState<{
    status: number
    data: unknown
    message: string
  } | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setCaughtError(null)
    try {
      await caller("middlewareApi")("misc:error", { code: 500 })
    } catch (e: unknown) {
      const err = e as { status?: number; data?: unknown; message?: string }
      setCaughtError({
        status: err.status ?? 500,
        data: err.data,
        message: err.message ?? "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <RunButton loading={loading} label="Trigger 500 Error" onClick={handleClick} />
      {caughtError && (
        <ResponseViewer
          data={{
            note: "Error caught on client (after server-side middleware fired)",
            ...caughtError,
          }}
          status={caughtError.status}
        />
      )}
    </>
  )
}
