import { formatDuration } from "@/lib/formatters";
import type { RequestEntry, ValidationIssue } from "@/store/types";
import { isStreamRequest, requestStateOf } from "./request-state";
import { deliveryChecks } from "./webhook-parts";

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
  const fields = fieldCount(r.variables);
  const meta = fields > 0 ? `${fields} ${fields === 1 ? "field" : "fields"}` : "";
  if (!r.hasValidation.variables) {
    const detail = "The endpoint declares no input schema";
    return { label: "No input validation", detail, meta, state: "idle" };
  }
  if (r.validated?.variables === "failed") {
    const detail = "Refused by the input schema; nothing was sent";
    return { label: "Variables rejected", detail, meta, state: "err" };
  }
  if (r.validated?.variables === "passed")
    return { label: "Variables validated", detail: "Matched the input schema", meta, state: "ok" };
  return { label: "Variables not validated", detail: "Not run", meta, state: "idle" };
}

function mismatchCheck(issues: ValidationIssue[]): RequestCheck {
  const [first] = issues;
  const count = `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`;
  const detail = first ? `${count} · ${first.path || "root"}` : count;
  return { label: "Response schema mismatch", detail, meta: count, state: "warn" };
}

function responseCheck(r: RequestEntry): RequestCheck {
  if (!r.hasValidation.response) {
    const detail = "The endpoint declares no response schema";
    return { label: "No response validation", detail, meta: "", state: "idle" };
  }
  if (r.validated?.response === "failed") return mismatchCheck(r.error?.validationIssues ?? []);
  if (r.validated?.response === "passed") {
    const detail = "Matched the response schema";
    return { label: "Response validated", detail, meta: "", state: "ok" };
  }
  return requestStateOf(r) === "pending"
    ? {
        label: "Response not validated yet",
        detail: "Waiting for the response",
        meta: "",
        state: "idle",
      }
    : {
        label: "Response not validated",
        detail: "Skipped · no response to check",
        meta: "",
        state: "idle",
      };
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
 * stream, its handshake, its connection and its middleware; for a webhook
 * delivered to the app, its signature, its body and its handler's answer.
 * Each title says what happened, so a check that did not run never reads
 * as passed.
 *
 * @param r - The request
 * @returns The checks
 * @example
 * ```ts
 * requestChecks(request).map((c) => c.label); // ["Variables validated", "Response validated", "Middleware"]
 * ```
 */
export function requestChecks(r: RequestEntry): RequestCheck[] {
  if (r.mode === "webhook") return deliveryChecks(r);
  if (isStreamRequest(r)) return streamChecks(r);
  const checks = [variablesCheck(r), responseCheck(r), middlewareCheck(r)];
  return r.cache ? [...checks, cacheCheck(r.cache)] : checks;
}
