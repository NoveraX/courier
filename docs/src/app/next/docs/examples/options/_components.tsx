"use client"

import { isHTTPError } from "@noverax/courier"
import { useState } from "react"

import { caller } from "@/lib/caller"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { SandboxChoice } from "@/site/sandbox/sandbox-choice"

/* The docs backend's /slow answers after about three seconds. */
const TIMEOUTS = [1000, 2000, 5000] as const

export function TimeoutDemo() {
  const [timeout, setTimeoutMs] = useState<number>(1000)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<unknown>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [elapsed, setElapsed] = useState<number | undefined>(undefined)
  const run = async () => {
    setLoading(true)
    setData(undefined)
    setError(undefined)
    const start = performance.now()
    try {
      setData(await caller.misc.with({ timeout }).slow())
    } catch (failure: unknown) {
      if (isHTTPError(failure)) setError(`${failure.status} · ${failure.message}`)
      else if (failure instanceof Error) setError(`${failure.name}: ${failure.message}`)
      else throw failure
    } finally {
      setElapsed(performance.now() - start)
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="caller.misc.with({ timeout }).slow()"
      controls={
        <>
          <SandboxChoice
            label="timeout (ms)"
            value={timeout}
            options={TIMEOUTS}
            onChange={setTimeoutMs}
          />
          <RunButton loading={loading} label="Fetch /slow" onClick={() => void run()} />
        </>
      }
      result={<ResponseView data={data} error={error} responseTime={elapsed} pending={loading} />}
    />
  )
}
