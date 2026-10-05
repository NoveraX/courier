import { isCredentialHeader } from "@/features/requests/credential-headers";
import type { HeaderGroup, HeaderRow } from "@/features/requests/header-groups";
import type { InspectorTabInfo } from "@/features/requests/inspector-tabs";
import type { PayloadView } from "@/features/requests/payload-view";
import { buildCurlSnippet } from "@/lib/snippets";
import type { MockRequestLog } from "@/store/mock-slice";
import { mockLogCode, mockLogTone } from "./mock-log";

const NONE: ReadonlyMap<string, string> = new Map();
/* Headers the transport adds on the way, which a replayed call sets itself. */
const TRANSPORT_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "user-agent",
]);

/** What the tabs of a mock request show. */
export interface MockRequestView {
  tabs: InspectorTabInfo[];
  response: PayloadView;
  request: PayloadView;
  headers: HeaderGroup[];
  /** A cURL that sends the request to the mock again. */
  curl: string;
  /** Whether credentials were left out of the cURL. */
  redacted: boolean;
}

function responseOf(log: MockRequestLog): PayloadView {
  if (log.data !== undefined) {
    return {
      value: log.data,
      chips: [{ label: mockLogCode(log), tone: mockLogTone(log) }],
      issues: NONE,
    };
  }
  if (log.status === undefined && log.error === undefined) {
    return {
      empty: { title: "Waiting for the answer", detail: "The mock has not answered yet." },
      chips: [],
      issues: NONE,
    };
  }
  const detail = log.error ?? "The mock answered with no body.";
  return { empty: { title: "No body", detail }, chips: [], issues: NONE };
}

function requestOf(log: MockRequestLog): PayloadView {
  const empty = log.variables === undefined || JSON.stringify(log.variables) === "{}";
  return empty
    ? {
        empty: { title: "No variables", detail: "The request sent none." },
        chips: [],
        issues: NONE,
      }
    : { value: log.variables, chips: [], issues: NONE };
}

function rowsOf(headers: Readonly<Record<string, string>> | undefined): HeaderRow[] {
  return Object.entries(headers ?? {}).map(([name, value]) => ({
    name,
    value,
    secret: isCredentialHeader(name),
  }));
}

function groupOf(key: "response" | "request", title: string, rows: HeaderRow[]): HeaderGroup {
  return { key, title, rows, total: rows.length };
}

function curlOf(log: MockRequestLog, serverUrl: string): { curl: string; redacted: boolean } {
  const kept = Object.entries(log.requestHeaders ?? {}).filter(
    ([name]) =>
      !TRANSPORT_HEADERS.has(name.toLowerCase()) && !name.toLowerCase().startsWith("sec-"),
  );
  const redacted = kept.some(([name]) => isCredentialHeader(name));
  const headers = Object.fromEntries(
    kept.map(([name, value]) => [name, isCredentialHeader(name) ? "<redacted>" : value]),
  );
  const method = log.httpMethod.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : log.variables;
  return {
    curl: buildCurlSnippet({ url: `${serverUrl}${log.path}`, method, headers, body }),
    redacted,
  };
}

/**
 * What a request the mock answered shows in its sheet: the answer and
 * what it was asked with, each side's headers with credentials masked, and
 * a cURL that sends it to the mock again — credentials left out.
 *
 * @param log - The request the mock logged
 * @param serverUrl - The mock's address, for the cURL
 * @returns The tabs and what each shows
 * @example
 * ```ts
 * mockRequestView(log, "http://localhost:7011").tabs.map((t) => t.key); // ["response", "request", "headers", "snippets"]
 * ```
 */
export function mockRequestView(log: MockRequestLog, serverUrl: string): MockRequestView {
  const headers = [
    groupOf("response", "Response headers", rowsOf(log.responseHeaders)),
    groupOf("request", "Request headers", rowsOf(log.requestHeaders)),
  ];
  const count = headers.reduce((n, g) => n + g.total, 0);
  return {
    tabs: [
      { key: "response", label: "Response", alert: mockLogTone(log) === "err" },
      { key: "request", label: "Request", alert: false },
      { key: "headers", label: "Headers", count, alert: false },
      { key: "snippets", label: "cURL", alert: false },
    ],
    response: responseOf(log),
    request: requestOf(log),
    headers,
    ...curlOf(log, serverUrl),
  };
}
