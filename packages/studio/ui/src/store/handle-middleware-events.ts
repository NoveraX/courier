import { isPlainObject } from "@/socket/is-plain-object";
import { num, optNum, str } from "./event-helpers";
import { readList } from "./payload";
import type { MiddlewareEntry, RequestEntry } from "./types";

type EventPayload = Record<string, unknown>;

export function withMiddlewareEnter(r: RequestEntry, event: EventPayload): RequestEntry {
  const mwEntry: MiddlewareEntry = {
    requestId: r.id,
    name: str(event.name),
    index: num(event.index),
    totalCount: optNum(event.totalCount),
    startedAt: num(event.timestamp, Date.now()),
    status: "running",
    phase: typeof event.phase === "string" ? event.phase : undefined,
  };
  return { ...r, middlewareEntries: [...r.middlewareEntries, mwEntry] };
}

export function withMiddlewareExit(r: RequestEntry, event: EventPayload): RequestEntry {
  const index = num(event.index);
  return {
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
            headersAdded: readList(
              event.headersAdded,
              (name): name is string => typeof name === "string",
            ),
          }
        : m,
    ),
  };
}

export function withMiddlewareError(r: RequestEntry, event: EventPayload): RequestEntry {
  const index = num(event.index);
  return {
    ...r,
    middlewareEntries: r.middlewareEntries.map((m) =>
      m.index === index
        ? {
            ...m,
            status: "error" as const,
            error:
              typeof event.error === "string"
                ? event.error
                : str(isPlainObject(event.error) ? event.error.message : undefined),
          }
        : m,
    ),
  };
}
