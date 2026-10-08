import { isPlainObject } from "../is-plain-object";
import { withoutCredentials } from "../storage/without-credentials";
import { withoutSecrets } from "./without-secrets";

type RuntimeEvent = Record<string, unknown>;

/** A request as an agent is told of it in a list: what it called, how it ended, and when. */
export interface RequestSummary {
  readonly id: string;
  readonly endpoint: string;
  readonly method?: string | undefined;
  readonly mode: string;
  /** The agent tool it ran for, when an MCP server made it. */
  readonly agent?: unknown;
  readonly state: "pending" | "success" | "error";
  readonly status?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly startedAt: number;
  readonly error?: string | undefined;
}

/** The events Studio kept of one request, sorted by what they are. */
interface Gathered {
  start: RuntimeEvent;
  end?: RuntimeEvent | undefined;
  error?: RuntimeEvent | undefined;
  others: RuntimeEvent[];
}

/**
 * The requests Studio kept, each from its events — the newest first.
 *
 * @param events - The events the request log keeps, oldest first
 * @returns Each request's events, by its id, newest request first
 * @example
 * ```ts
 * gatherRequests(log.events()).size;
 * ```
 */
export function gatherRequests(events: readonly RuntimeEvent[]): Map<string, Gathered> {
  const byId = new Map<string, Gathered>();
  for (const event of events) {
    const id = event.type === "request:start" ? event.id : (event.requestId ?? event.id);
    if (typeof id !== "string") continue;
    if (event.type === "request:start") byId.set(id, { start: event, others: [] });
    const gathered = byId.get(id);
    if (gathered === undefined || event.type === "request:start") continue;
    if (event.type === "request:end") gathered.end = event;
    else if (event.type === "request:error") gathered.error = event;
    else gathered.others.push(event);
  }
  return new Map([...byId].reverse());
}

/**
 * A request in a list: its endpoint, method, mode, the agent tool it ran
 * for, how it ended, and how long it took.
 *
 * @param id - The request's id
 * @param gathered - Its events
 * @returns The summary
 * @example
 * ```ts
 * summaryOf("req_1", gathered);
 * ```
 */
export function summaryOf(id: string, gathered: Gathered): RequestSummary {
  const { start, end, error } = gathered;
  const failure = isPlainObject(error?.error) ? error.error : undefined;
  const timing = isPlainObject(end?.timing)
    ? end.timing
    : isPlainObject(error?.timing)
      ? error.timing
      : undefined;
  return {
    id,
    endpoint: [start.source, start.group, start.method]
      .filter((part) => typeof part === "string" && part !== "")
      .join("."),
    method: typeof start.httpMethod === "string" ? start.httpMethod : undefined,
    mode: typeof start.mode === "string" ? start.mode : "direct",
    ...(start.agent !== undefined && { agent: start.agent }),
    state: error ? "error" : end ? "success" : "pending",
    status: numberOf(end?.status) ?? numberOf(error?.status) ?? numberOf(failure?.status),
    durationMs: numberOf(timing?.total),
    startedAt: numberOf(start.timestamp) ?? 0,
    error: typeof failure?.message === "string" ? failure.message : undefined,
  };
}

/**
 * A request in full, as an agent is shown it: its summary, the variables it
 * sent and the answer it got, its headers, its timing, its failure and the
 * other events it raised — every credential's value and every field named
 * like a secret replaced.
 *
 * @param id - The request's id
 * @param gathered - Its events
 * @returns The detail
 * @example
 * ```ts
 * detailOf("req_1", gathered).variables;
 * ```
 */
export function detailOf(id: string, gathered: Gathered): Record<string, unknown> {
  const end = gathered.end && (withoutCredentials(gathered.end) as RuntimeEvent);
  const error = gathered.error && (withoutCredentials(gathered.error) as RuntimeEvent);
  return withoutSecrets({
    ...summaryOf(id, gathered),
    variables: gathered.start.variables,
    answer: end?.data ?? error?.data,
    requestHeaders: end?.requestHeaders,
    headers: end?.headers ?? error?.headers,
    timing: end?.timing ?? error?.timing,
    failure: error?.error,
    events: gathered.others.map((event) => withoutCredentials(event)),
  }) as Record<string, unknown>;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
