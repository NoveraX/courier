"use client"

import { useState } from "react"

import { caller } from "@/lib/caller"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

function useCall(call: () => Promise<unknown>) {
  const [data, setData] = useState<unknown>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const run = async () => {
    setLoading(true)
    setData(undefined)
    setError(undefined)
    try {
      setData(await call())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The call failed")
    } finally {
      setLoading(false)
    }
  }
  return { data, error, loading, run }
}

export function NormalFetchDemo() {
  const users = useCall(() => caller.users.getAll())
  return (
    <Sandbox
      label="caller.users.getAll()"
      controls={
        <RunButton loading={users.loading} label="Fetch users" onClick={() => void users.run()} />
      }
      result={<ResponseView data={users.data} error={users.error} pending={users.loading} />}
    />
  )
}

export function RawFetchDemo() {
  const raw = useCall(() => caller.users.raw.getAll())
  const status =
    typeof raw.data === "object" &&
    raw.data !== null &&
    "status" in raw.data &&
    typeof raw.data.status === "number"
      ? raw.data.status
      : undefined
  return (
    <Sandbox
      label="caller.users.raw.getAll()"
      controls={
        <RunButton loading={raw.loading} label="Fetch users, raw" onClick={() => void raw.run()} />
      }
      result={
        <ResponseView data={raw.data} status={status} error={raw.error} pending={raw.loading} />
      }
    />
  )
}
