"use client"

import { isHTTPError } from "@noverax/courier"
import { useRef, useState } from "react"

import { caller } from "@/lib/caller"
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

export function DedupDemo() {
  const latest = useRef<AbortController | null>(null)
  const [clicks, setClicks] = useState(0)
  const [aborted, setAborted] = useState(0)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<unknown>(undefined)
  const fetchUsers = async () => {
    if (latest.current) {
      latest.current.abort()
      setAborted((n) => n + 1)
    }
    const controller = new AbortController()
    latest.current = controller
    setClicks((n) => n + 1)
    setLoading(true)
    setData(undefined)
    try {
      setData(await caller.users.with({ signal: controller.signal }).getAll())
    } catch (failure: unknown) {
      /* A click that came after this one aborted it: the later call answers. */
      if (!isAbort(failure)) throw failure
    } finally {
      if (latest.current === controller) {
        setLoading(false)
        latest.current = null
      }
    }
  }
  const reset = () => {
    latest.current?.abort()
    latest.current = null
    setClicks(0)
    setAborted(0)
    setLoading(false)
    setData(undefined)
  }
  return (
    <Sandbox
      label="caller.users.with({ signal }).getAll()"
      controls={
        <>
          <RunButton loading={loading} label="Fetch users" onClick={() => void fetchUsers()} />
          <RunButton variant="secondary" label="Reset" onClick={reset} />
          <p className="m-0 flex gap-4 font-mono text-meta text-fg-subtle">
            <span>clicks {clicks}</span>
            <span>aborted {aborted}</span>
          </p>
        </>
      }
      result={<ResponseView data={data} pending={loading} />}
    />
  )
}
