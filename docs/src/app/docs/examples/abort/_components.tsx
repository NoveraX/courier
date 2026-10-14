"use client"

import { isHTTPError } from "@noverax/courier"
import { useRef, useState } from "react"

import { caller, searchCaller } from "@/lib/caller"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

export function ManualAbortDemo() {
  const controller = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<unknown>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const start = async () => {
    setLoading(true)
    setData(undefined)
    setError(undefined)
    controller.current = new AbortController()
    try {
      setData(await caller.misc.with({ signal: controller.current.signal }).slow())
    } catch (failure: unknown) {
      if (isAbort(failure)) setError("Aborted: Cancel stopped the request")
      else if (isHTTPError(failure)) setError(`${failure.status} · ${failure.message}`)
      else throw failure
    } finally {
      setLoading(false)
      controller.current = null
    }
  }
  return (
    <Sandbox
      label="caller.misc.with({ signal }).slow()"
      controls={
        <>
          <RunButton loading={loading} label="Start a slow request" onClick={() => void start()} />
          <RunButton
            variant="secondary"
            label="Cancel"
            disabled={!loading}
            onClick={() => controller.current?.abort()}
            className="text-err"
          />
        </>
      }
      result={<ResponseView data={data} error={error} pending={loading} />}
    />
  )
}

/* The requests that reached the proxy while `run` ran, as the browser's own resource timing counts them. */
async function requestsWhile(match: string, run: () => Promise<unknown>): Promise<number> {
  const seen: PerformanceEntry[] = []
  const observer = new PerformanceObserver((list) => seen.push(...list.getEntries()))
  observer.observe({ type: "resource" })
  await run()
  /* An entry is queued as its response ends, a moment after the call settles. */
  await new Promise((resolve) => setTimeout(resolve, 100))
  seen.push(...observer.takeRecords())
  observer.disconnect()
  return seen.filter((entry) => entry.name.includes(match)).length
}

export function SharedReadsDemo() {
  const [loading, setLoading] = useState(false)
  const [counted, setCounted] = useState<{ calls: number; requests: number } | undefined>()
  const run = async () => {
    setLoading(true)
    setCounted(undefined)
    try {
      const requests = await requestsWhile("_m=getAll", () =>
        Promise.all([caller.users.getAll(), caller.users.getAll(), caller.users.getAll()])
      )
      setCounted({ calls: 3, requests })
    } finally {
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="Promise.all([users.getAll(), users.getAll(), users.getAll()])"
      controls={
        <>
          <RunButton
            loading={loading}
            label="Read the users three times"
            onClick={() => void run()}
          />
          {counted && (
            <p className="m-0 flex gap-4 font-mono text-meta text-fg-subtle">
              <span>calls {counted.calls}</span>
              <span>requests {counted.requests}</span>
            </p>
          )}
        </>
      }
      result={<ResponseView data={counted} pending={loading} />}
    />
  )
}

export function CancelPreviousDemo() {
  const [calls, setCalls] = useState(0)
  const [cancelled, setCancelled] = useState(0)
  const [pending, setPending] = useState(0)
  const [data, setData] = useState<unknown>(undefined)
  const call = async () => {
    setCalls((n) => n + 1)
    setPending((n) => n + 1)
    try {
      setData(await searchCaller.misc.slow())
    } catch (failure: unknown) {
      /* A newer call cancelled this one: it answers instead. */
      if (isHTTPError(failure) && failure.status === 499) setCancelled((n) => n + 1)
      else throw failure
    } finally {
      setPending((n) => n - 1)
    }
  }
  const reset = () => {
    setCalls(0)
    setCancelled(0)
    setData(undefined)
  }
  return (
    <Sandbox
      label="searchCaller.misc.slow()"
      controls={
        <>
          {/* Stays clickable while a call is in flight: the next click is what cancels it. */}
          <RunButton label="Call, then call again" onClick={() => void call()} />
          <RunButton variant="secondary" label="Reset" disabled={pending > 0} onClick={reset} />
          <p className="m-0 flex gap-4 font-mono text-meta text-fg-subtle">
            <span>calls {calls}</span>
            <span>in flight {pending}</span>
            <span>cancelled {cancelled}</span>
          </p>
        </>
      }
      result={<ResponseView data={data} pending={pending > 0} />}
    />
  )
}
