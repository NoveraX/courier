import type { RequestEntry, MiddlewareEntry } from "./types"
import { str, num, optNum } from "./event-helpers"

type EventPayload = Record<string, unknown>
type State = { requests: RequestEntry[] }

export function handleMiddlewareEnter(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const mwEntry: MiddlewareEntry = {
    requestId,
    name: str(event.name),
    index: num(event.index),
    totalCount: optNum(event.totalCount),
    startedAt: num(event.timestamp, Date.now()),
    status: "running",
    phase: typeof event.phase === "string" ? event.phase : undefined,
  }
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? { ...r, middlewareEntries: [...r.middlewareEntries, mwEntry] }
        : r
    ),
  }
}

export function handleMiddlewareExit(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const index = num(event.index)
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            middlewareEntries: r.middlewareEntries.map((m) =>
              m.index === index
                ? {
                    ...m,
                    status: "completed" as const,
                    duration: optNum(event.duration),
                    phase: typeof event.phase === "string" ? event.phase : m.phase,
                    beforeDuration: optNum(event.beforeDuration),
                    afterDuration: optNum(event.afterDuration),
                    headersAdded: Array.isArray(event.headersAdded) ? event.headersAdded as string[] : undefined,
                  }
                : m
            ),
          }
        : r
    ),
  }
}

export function handleMiddlewareError(state: State, event: EventPayload): { requests: RequestEntry[] } {
  const requestId = str(event.requestId)
  const index = num(event.index)
  return {
    requests: state.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            middlewareEntries: r.middlewareEntries.map((m) =>
              m.index === index
                ? {
                    ...m,
                    status: "error" as const,
                    error:
                      typeof event.error === "string"
                        ? event.error
                        : str((event.error as Record<string, unknown> | undefined)?.message),
                  }
                : m
            ),
          }
        : r
    ),
  }
}
