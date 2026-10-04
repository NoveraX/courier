import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import { isStreamRequest, requestStateOf } from "./request-state";

/** A check the Overview lists: what Courier verified of the request, and how it went. */
export interface RequestCheck {
  label: string;
  detail: string;
  meta: string;
  state: "ok" | "warn" | "err" | "idle";
}

function fieldCount(value: unknown): number {
  return typeof value === "object" && value !== null ? Object.keys(value).length : 0;
}

function variablesCheck(r: RequestEntry): RequestCheck {
  const label = "Variables validated";
  const fields = fieldCount(r.variables);
  const meta = fields > 0 ? `${fields} ${fields === 1 ? "field" : "fields"}` : "";
  if (!r.hasValidation.variables)
    return { label, detail: "The endpoint declares no input schema", meta, state: "idle" };
  if (r.validated?.variables === "failed") {
    return { label, detail: "Refused by the input schema; nothing was sent", meta, state: "err" };
  }
  if (r.validated?.variables === "passed")
    return { label, detail: "Matched the input schema", meta, state: "ok" };
  return { label, detail: "Not run", meta, state: "idle" };
}

function responseCheck(r: RequestEntry): RequestCheck {
  const label = "Response validated";
  const issues = r.error?.validationIssues ?? [];
  if (!r.hasValidation.response)
    return { label, detail: "The endpoint declares no response schema", meta: "", state: "idle" };
  if (r.validated?.response === "failed") {
    const [first] = issues;
    const count = `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`;
    return {
      label,
      detail: first ? `${count} · ${first.path || "root"}` : count,
      meta: count,
      state: "warn",
    };
  }
  if (r.validated?.response === "passed")
    return { label, detail: "Matched the response schema", meta: "", state: "ok" };
  const state = requestStateOf(r);
  const detail =
    state === "pending" ? "Waiting for the response" : "Skipped · no response to check";
  return { label, detail, meta: "", state: "idle" };
}

function middlewareCheck(r: RequestEntry): RequestCheck {
  const label = "Middleware";
  const steps = [...r.middlewareEntries].sort((a, b) => a.index - b.index);
  if (steps.length === 0) return { label, detail: "No middleware ran", meta: "", state: "idle" };
  const meta = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const failed = steps.find((s) => s.status === "error");
  if (failed)
    return {
      label,
      detail: `${failed.name} failed${failed.error ? `: ${failed.error}` : ""}`,
      meta,
      state: "err",
    };
  return { label, detail: steps.map((s) => s.name).join(" → "), meta, state: "ok" };
}

function cacheCheck(cache: NonNullable<RequestEntry["cache"]>): RequestCheck {
  if (!cache.hit)
    return { label: "Cache", detail: "Not in the cache; fetched", meta: "miss", state: "idle" };
  const age = cache.age === undefined ? "" : `, stored ${formatDuration(cache.age)} before`;
  return { label: "Cache", detail: `Served from the cache${age}`, meta: "hit", state: "ok" };
}

function streamChecks(r: RequestEntry): RequestCheck[] {
  const state = requestStateOf(r);
  const opened = r.transport === "ws" ? "Upgraded to a WebSocket" : "Opened as text/event-stream";
  const connection: RequestCheck =
    state === "error"
      ? {
          label: "Connection",
          detail: r.error?.message ?? "Closed with an error",
          meta: "",
          state: "err",
        }
      : state === "streaming"
        ? { label: "Connection", detail: "Open", meta: "live", state: "ok" }
        : {
            label: "Connection",
            detail: "Closed by the server",
            meta: r.streamDuration === undefined ? "" : formatDuration(r.streamDuration),
            state: "ok",
          };
  return [
    {
      label: "Handshake",
      detail: opened,
      meta: r.statusCode ? String(r.statusCode) : "",
      state: "ok",
    },
    connection,
    middlewareCheck(r),
  ];
}

/**
 * What Courier checked of a request, in the order it ran the checks: the
 * variables against the input schema, the answer against the response
 * schema, the middleware chain and — when it took part — the cache; for a
 * stream, its handshake, its connection and its middleware.
 *
 * @param r - The request
 * @returns The checks
 * @example
 * ```ts
 * requestChecks(request).map((c) => c.label); // ["Variables validated", "Response validated", "Middleware"]
 * ```
 */
export function requestChecks(r: RequestEntry): RequestCheck[] {
  if (isStreamRequest(r)) return streamChecks(r);
  const checks = [variablesCheck(r), responseCheck(r), middlewareCheck(r)];
  return r.cache ? [...checks, cacheCheck(r.cache)] : checks;
}
