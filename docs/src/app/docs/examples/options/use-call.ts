"use client"

import { isHTTPError } from "@noverax/courier/client"
import { useState } from "react"

/**
 * One call a sandbox makes on its button: what it answered or failed
 * with, how long it took, and whether it is in flight.
 *
 * @param call - The call
 * @returns Its state, and what runs it
 * @example
 * ```ts
 * const late = useCall(() => caller.misc.slowRetried())
 * ```
 */
export function useCall(call: () => Promise<unknown>) {
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
      setData(await call())
    } catch (failure: unknown) {
      if (isHTTPError(failure)) setError(`${failure.status} · ${failure.message}`)
      else if (failure instanceof Error) setError(`${failure.name}: ${failure.message}`)
      else throw failure
    } finally {
      setElapsed(performance.now() - start)
      setLoading(false)
    }
  }
  return { loading, data, error, elapsed, run: () => void run() }
}
