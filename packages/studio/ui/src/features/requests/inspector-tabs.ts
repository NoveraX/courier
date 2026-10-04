import type { RequestEntry } from "@/store/types";
import { headerCount } from "./header-groups";
import { isFailedState, isStreamRequest, requestStateOf } from "./request-state";

/** The inspector's tabs. */
export const INSPECTOR_TABS = [
  "overview",
  "failure",
  "response",
  "request",
  "headers",
  "timing",
  "snippets",
  "messages",
] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];

/** A tab as the inspector shows it for a request. */
export interface InspectorTabInfo {
  key: InspectorTab;
  label: string;
  count?: number | undefined;
  /** Whether it tells of a failure. */
  alert: boolean;
}

/**
 * Whether a value names one of the inspector's tabs.
 *
 * @param value - The value, from an address
 * @returns Whether it is a tab
 * @example
 * ```ts
 * isInspectorTab("timing"); // true
 * ```
 */
export function isInspectorTab(value: unknown): value is InspectorTab {
  return INSPECTOR_TABS.some((tab) => tab === value);
}

/**
 * The tabs the inspector shows for a request: the failure's right after
 * the overview when it failed; the answer, the request, its headers, its
 * timing and its snippets for HTTP; the messages for a stream.
 *
 * @param r - The request
 * @returns The tabs, in order
 * @example
 * ```ts
 * inspectorTabsOf(stream).map((t) => t.key); // ["overview", "messages", "headers", "snippets"]
 * ```
 */
export function inspectorTabsOf(r: RequestEntry): InspectorTabInfo[] {
  const state = requestStateOf(r);
  const failure: InspectorTabInfo[] = isFailedState(state)
    ? [
        {
          key: "failure",
          label: state === "validation_error" ? "Validation" : "Error",
          alert: true,
        },
      ]
    : [];
  const headers: InspectorTabInfo = {
    key: "headers",
    label: "Headers",
    count: headerCount(r),
    alert: false,
  };
  const snippets: InspectorTabInfo = { key: "snippets", label: "Snippets", alert: false };
  const overview: InspectorTabInfo = { key: "overview", label: "Overview", alert: false };
  if (isStreamRequest(r)) {
    const count = Math.max(r.streamEventCount ?? 0, r.streamEvents?.length ?? 0);
    const messages: InspectorTabInfo = { key: "messages", label: "Messages", count, alert: false };
    return [overview, ...failure, messages, headers, snippets];
  }
  return [
    overview,
    ...failure,
    { key: "response", label: "Response", alert: false },
    { key: "request", label: "Request", alert: false },
    headers,
    { key: "timing", label: "Timing", alert: false },
    snippets,
  ];
}

/**
 * The tab to show for a request: the one asked for when the request has
 * it, else its failure when it failed, its messages when it streams, or
 * its overview.
 *
 * @param r - The request
 * @param wanted - The tab asked for
 * @returns The tab
 * @example
 * ```ts
 * shownTab(failedRequest, undefined); // "failure"
 * ```
 */
export function shownTab(r: RequestEntry, wanted: InspectorTab | undefined): InspectorTab {
  const tabs = inspectorTabsOf(r).map((t) => t.key);
  if (wanted && tabs.includes(wanted)) return wanted;
  if (tabs.includes("failure")) return "failure";
  return isStreamRequest(r) ? "messages" : "overview";
}
