"use client"

import { isHTTPError } from "@noverax/courier"
import { useState } from "react"

import { caller } from "@/lib/caller"
import { ResponseView } from "@/site/sandbox/response-view"
import { RunButton } from "@/site/sandbox/run-button"
import { Sandbox } from "@/site/sandbox/sandbox"
import { SandboxChoice } from "@/site/sandbox/sandbox-choice"

const ERROR_CODES = [400, 401, 403, 404, 422, 500, 502, 503] as const

interface Caught {
  name: string
  status: number
  message: string
  data: unknown
}

export function CatchDemo() {
  const [code, setCode] = useState<number>(404)
  const [loading, setLoading] = useState(false)
  const [caught, setCaught] = useState<Caught | null>(null)
  const trigger = async () => {
    setLoading(true)
    setCaught(null)
    try {
      await caller.misc.error({ code })
    } catch (failure: unknown) {
      if (!isHTTPError(failure)) throw failure
      setCaught({
        name: failure.name,
        status: failure.status,
        message: failure.message,
        data: failure.data,
      })
    } finally {
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="caller.misc.error({ code })"
      controls={
        <>
          <SandboxChoice label="code" value={code} options={ERROR_CODES} onChange={setCode} />
          <RunButton loading={loading} label={`Trigger a ${code}`} onClick={() => void trigger()} />
        </>
      }
      result={<ResponseView data={caught ?? undefined} status={caught?.status} pending={loading} />}
    />
  )
}

export function GuardDemo() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    isHttpError: boolean
    status?: number
    data?: unknown
  } | null>(null)
  const trigger = async () => {
    setLoading(true)
    setResult(null)
    try {
      await caller.misc.error({ code: 403 })
    } catch (failure: unknown) {
      setResult(
        isHTTPError(failure)
          ? { isHttpError: true, status: failure.status, data: failure.data }
          : { isHttpError: false }
      )
    } finally {
      setLoading(false)
    }
  }
  return (
    <Sandbox
      label="isHTTPError(error)"
      controls={
        <RunButton loading={loading} label="Trigger a 403" onClick={() => void trigger()} />
      }
      result={<ResponseView data={result ?? undefined} status={result?.status} pending={loading} />}
    />
  )
}
