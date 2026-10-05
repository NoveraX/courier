"use client"

import { isHTTPError } from "@noverax/courier"
import { useState } from "react"

import { middlewareCaller } from "@/lib/caller"
import { middlewareQ } from "@/lib/query"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

export function MiddlewareDemo() {
  const { data, isFetching, error, refetch } = middlewareQ.users.useQuery("getAll", {
    enabled: false,
  })
  return (
    <Sandbox
      label={'middlewareQ.users.useQuery("getAll")'}
      controls={
        <RunButton loading={isFetching} label="Fetch users" onClick={() => void refetch()} />
      }
      result={<ResponseView data={data} error={error?.message} pending={isFetching} />}
    />
  )
}

interface Caught {
  status: number
  data: unknown
  message: string
}

export function OnErrorDemo() {
  const [loading, setLoading] = useState(false)
  const [caught, setCaught] = useState<Caught | null>(null)
  const trigger = async () => {
    setLoading(true)
    setCaught(null)
    try {
      await middlewareCaller.misc.error({ code: 500 })
    } catch (failure: unknown) {
      setCaught(
        isHTTPError(failure)
          ? { status: failure.status, data: failure.data, message: failure.message }
          : {
              status: 500,
              data: null,
              message: failure instanceof Error ? failure.message : "Unknown error",
            }
      )
    } finally {
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="middlewareCaller.misc.error({ code: 500 })"
      controls={
        <RunButton loading={loading} label="Trigger a 500" onClick={() => void trigger()} />
      }
      result={
        <ResponseView
          data={
            caught
              ? { note: "Caught here, after the server's middleware ran", ...caught }
              : undefined
          }
          status={caught?.status}
          pending={loading}
        />
      }
    />
  )
}
