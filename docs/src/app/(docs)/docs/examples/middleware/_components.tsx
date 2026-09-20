"use client"

import { isHTTPError } from "@noverax/courier"
import { useState } from "react"
import { ResponseViewer } from "@/components/docs/response-viewer"
import { RunButton } from "@/components/run-button"
import { middlewareCaller } from "@/lib/caller"
import { middlewareQ } from "@/lib/query"

export function MiddlewareDemo() {
  const { data, isFetching, error, refetch } = middlewareQ.users.useQuery("getAll", {
    enabled: false,
  })

  return (
    <>
      <RunButton
        loading={isFetching}
        label="Fetch Users (with middleware)"
        onClick={() => void refetch()}
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
      await middlewareCaller.misc.error({ code: 500 })
    } catch (e: unknown) {
      if (isHTTPError(e)) {
        setCaughtError({
          status: e.status,
          data: e.data,
          message: e.message,
        })
      } else {
        setCaughtError({
          status: 500,
          data: null,
          message: e instanceof Error ? e.message : "Unknown error",
        })
      }
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
