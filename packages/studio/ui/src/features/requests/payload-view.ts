import type { RequestEntry } from "@/store/types";
import { requestStateOf } from "./request-state";

/** A mark over a payload: how its schema check went, or the status that came with it. */
export interface PayloadChip {
  label: string;
  tone: "ok" | "warn" | "err";
}

/** What the Response or the Request tab shows of a payload. */
export interface PayloadView {
  /** The payload to show as JSON, when there is one. */
  value?: unknown;
  /** The size in bytes of the whole payload, when `value` is a part of it. */
  cutFrom?: number | undefined;
  /** The answer as text, when it is not JSON. */
  text?: string | undefined;
  /** What the tab says in place of a payload. */
  empty?: { title: string; detail: string } | undefined;
  chips: PayloadChip[];
  /** The validation issues by the path they point at. */
  issues: ReadonlyMap<string, string>;
}

const NONE: ReadonlyMap<string, string> = new Map();

function issuesOf(r: RequestEntry): ReadonlyMap<string, string> {
  return new Map((r.error?.validationIssues ?? []).map((issue) => [issue.path, issue.message]));
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "object" && Object.keys(value).length === 0;
}

/**
 * What the Response tab shows: the answer as JSON — or as text when it is
 * not JSON — marked with how its schema check went and the issues it
 * found; or why there is none.
 *
 * @param r - The request
 * @returns The view
 * @example
 * ```ts
 * responseView(request).chips; // [{ label: "schema ok", tone: "ok" }]
 * ```
 */
export function responseView(r: RequestEntry): PayloadView {
  const state = requestStateOf(r);
  if (state === "pending") {
    return {
      empty: { title: "Waiting for the response", detail: "The request is still in flight." },
      chips: [],
      issues: NONE,
    };
  }
  if (state === "aborted") {
    return {
      empty: {
        title: "No response",
        detail: "The request was aborted before the server answered.",
      },
      chips: [],
      issues: NONE,
    };
  }
  const chips: PayloadChip[] = [];
  if (state === "error" && r.statusCode) chips.push({ label: String(r.statusCode), tone: "err" });
  if (r.validated?.response === "passed") chips.push({ label: "schema ok", tone: "ok" });
  if (r.validated?.response === "failed") chips.push({ label: "schema mismatch", tone: "warn" });
  const issues = r.validated?.response === "failed" ? issuesOf(r) : NONE;
  if (typeof r.data === "string") return { text: r.data, cutFrom: r.dataCutFrom, chips, issues };
  if (r.data !== undefined && r.data !== null) {
    return { value: r.data, cutFrom: r.dataCutFrom, chips, issues };
  }
  const title = r.statusCode === 204 ? "204 No Content" : "No content";
  return { empty: { title, detail: "The server answered with an empty body." }, chips, issues };
}

/**
 * What the Request tab shows: the variables the call was made with, marked
 * with how the input schema took them; or that there were none.
 *
 * @param r - The request
 * @returns The view
 * @example
 * ```ts
 * requestView(request).value; // { page: 2 }
 * ```
 */
export function requestView(r: RequestEntry): PayloadView {
  const chips: PayloadChip[] = [];
  if (r.validated?.variables === "passed") chips.push({ label: "validated", tone: "ok" });
  if (r.validated?.variables === "failed")
    chips.push({ label: "refused by the schema", tone: "err" });
  const issues = r.validated?.variables === "failed" ? issuesOf(r) : NONE;
  const value = r.variables;
  if (isEmpty(value)) {
    return {
      empty: { title: "No variables", detail: "The call was made without input." },
      chips,
      issues,
    };
  }
  return { value, cutFrom: r.variablesCutFrom, chips, issues };
}
