import { readCause } from "@noverax/courier-studio-core";

import { causeText, type PayloadView } from "@/features/requests/payload-view";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

const NONE: ReadonlyMap<string, string> = new Map();

/**
 * The answer of a run the runtime has not reported as a request — the
 * runtime refused it, or the report is still on its way — read from what
 * the run itself received: for one that got no answer, why.
 *
 * @param entry - The run
 * @returns What the Body tab shows
 * @example
 * ```ts
 * entryPayloadView(entry).value; // { id: "ord_7Q2", … }
 * ```
 */
export function entryPayloadView(entry: PlaygroundHistoryEntry): PayloadView {
  if (entry.status === "error" && typeof entry.response === "string") {
    return { empty: { title: "The call failed", detail: entry.response }, chips: [], issues: NONE };
  }
  const cause =
    entry.status === "error" && !entry.statusCode ? readCause(entry.response) : undefined;
  if (cause)
    return { empty: { title: "No answer", detail: causeText(cause) }, chips: [], issues: NONE };
  if (entry.response === undefined || entry.response === null) {
    return {
      empty: { title: "No content", detail: "The call answered with an empty body." },
      chips: [],
      issues: NONE,
    };
  }
  const chips: PayloadView["chips"] =
    entry.status === "error" && entry.statusCode
      ? [{ label: String(entry.statusCode), tone: "err" }]
      : [];
  return { value: entry.response, chips, issues: NONE };
}
