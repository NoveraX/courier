import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import type { ValidationIssue } from "@/store/types-events";
import { failureHint } from "./failure-hints";
import { endpointParts } from "./request-parts";
import { isFailedState, isStreamRequest, requestStateOf } from "./request-state";
import { deliveryFailureOf, deliveryStopOf } from "./webhook-delivery";
import { deliveryStages } from "./webhook-parts";

/** A stage a failed request went through, and how it ended there. */
export interface FailureStage {
  label: string;
  state: "ok" | "err" | "skip";
  meta: string;
}

/** What the Error tab tells of a request that failed. */
export interface FailureView {
  /** A broken schema reads as a warning; anything else as an error. */
  severity: "warn" | "err";
  type: string;
  code: string;
  message: string;
  /** What the system said of a request that got no answer, when the runtime could tell. */
  cause: string | undefined;
  where: string;
  stages: FailureStage[];
  issues: ValidationIssue[];
  hint: string | undefined;
  /** The error as Courier reported it, for copying. */
  raw: string;
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

function httpStages(r: RequestEntry, refused: boolean, broken: boolean): FailureStage[] {
  const failedStep = r.middlewareEntries.find((e) => e.status === "error");
  const steps = r.middlewareEntries.length;
  /* A proxy that got no answer from the upstream answers its caller 502 itself: the fetch still got none. */
  const answered = r.statusCode !== undefined && r.statusCode > 0 && !r.error?.cause;
  return [
    failedStep
      ? { label: "Middleware", state: "err", meta: `${failedStep.name} failed` }
      : {
          label: "Middleware",
          state: steps > 0 ? "ok" : "skip",
          meta: steps > 0 ? `${steps} passed` : "none",
        },
    refused
      ? { label: "Fetch", state: "skip", meta: "not sent" }
      : {
          label: "Fetch",
          state: broken ? "ok" : "err",
          meta: answered ? String(r.statusCode) : "no answer",
        },
    broken
      ? {
          label: "Validation",
          state: "err",
          meta: plural(r.error?.validationIssues?.length ?? 0, "issue"),
        }
      : { label: "Validation", state: "skip", meta: "skipped" },
  ];
}

function whereItFailed(r: RequestEntry, refused: boolean, broken: boolean): string {
  const ms = r.timing?.total;
  const after = ms === undefined ? "" : ` after ${formatDuration(ms)}`;
  if (refused) return "Refused before it was sent: the variables broke the input schema";
  if (broken) {
    const { name } = endpointParts(r);
    return `The answer arrived${ms === undefined ? "" : ` in ${formatDuration(ms)}`} but broke ${name}'s response schema`;
  }
  return `Failed at the fetch${after}`;
}

/* A delivery made to the app fails in its own parts — its signature, its body, its handler — not in a call's. */
function webhookParts(r: RequestEntry): Pick<FailureView, "where" | "stages" | "hint"> {
  const stop = deliveryStopOf(r);
  const stages = deliveryStages(r);
  return stop
    ? { ...deliveryFailureOf(stop, r.timing?.total), stages }
    : { where: r.error?.message ?? "The delivery failed", stages, hint: undefined };
}

function streamStages(r: RequestEntry): FailureStage[] {
  const count = r.streamEventCount ?? r.streamEvents?.length ?? 0;
  return [
    { label: "Handshake", state: "ok", meta: r.transport === "ws" ? "upgraded" : "opened" },
    { label: "Messages", state: "ok", meta: plural(count, "message") },
    { label: "Close", state: "err", meta: "with an error" },
  ];
}

/**
 * What the Error tab tells of a request that failed: the error — for one
 * that got no answer, the system's code and text — where in Courier's
 * pipeline it happened, the schema issues, advice when its kind or code
 * says enough, and the error as reported.
 *
 * @param r - The request
 * @returns The view, or `null` for a request that did not fail
 * @example
 * ```ts
 * failureOf(request)?.where; // "Failed at the fetch after 3.20s"
 * ```
 */
export function failureOf(r: RequestEntry): FailureView | null {
  const state = requestStateOf(r);
  if (!isFailedState(state)) return null;
  const error = r.error ?? { type: "error", message: "The request failed" };
  const stream = isStreamRequest(r);
  const broken = state === "validation_error" && r.validated?.variables !== "failed";
  const refused = r.validated?.variables === "failed";
  const status = r.statusCode ? String(r.statusCode) : undefined;
  const code = broken || refused ? "schema" : (error.cause?.code ?? status ?? error.type);
  const raw = JSON.stringify(
    {
      type: error.type,
      status: r.statusCode,
      message: error.message,
      cause: error.cause,
      requestId: r.id,
      issues: error.validationIssues,
    },
    null,
    2,
  );
  const parts =
    r.mode === "webhook"
      ? webhookParts(r)
      : {
          where: stream ? "The stream ended with an error" : whereItFailed(r, refused, broken),
          stages: stream ? streamStages(r) : httpStages(r, refused, broken),
          hint: failureHint(r),
        };
  return {
    severity: state === "validation_error" ? "warn" : "err",
    type: error.type.toUpperCase(),
    code,
    message: error.message,
    cause: error.cause?.message,
    ...parts,
    issues: error.validationIssues ?? [],
    raw,
  };
}
