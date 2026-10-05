/**
 * Session export — HAR format.
 */

import { cutBodyNote } from "./cut-body-note";
import { queryPairs, sentRequest, statusText } from "./session-export-utils";
import type { SavedRequest, SavedSession } from "./session-types";

// ── Types ──────────────────────────────────────────────────────────────────

interface HarLog {
  version: string;
  creator: { name: string; version: string };
  entries: HarEntry[];
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: HarHeader[];
    queryString: HarQueryParam[];
    bodySize: number;
    postData?: { mimeType: string; text: string; comment?: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: HarHeader[];
    content: { size: number; mimeType: string; text: string; comment?: string };
    bodySize: number;
  };
  timings: { send: number; wait: number; receive: number };
}

interface HarHeader {
  name: string;
  value: string;
}

interface HarQueryParam {
  name: string;
  value: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/* What a request's version is written as when its runtime could not tell one,
   rather than a version it may not have gone over. */
const UNKNOWN_VERSION = "unknown";

function headersToHar(headers?: Record<string, string>): HarHeader[] {
  if (!headers) return [];
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function requestToHarEntry(req: SavedRequest): HarEntry {
  const fetchTime = req.timing?.fetch ?? 0;
  const totalTime = req.timing?.total ?? fetchTime;
  const { method, body } = sentRequest(req);

  return {
    startedDateTime: new Date(req.startedAt).toISOString(),
    time: totalTime,
    request: {
      method,
      url: req.url ?? `${req.source}.${req.group ?? ""}.${req.method}`,
      httpVersion: req.httpVersion ?? UNKNOWN_VERSION,
      headers: headersToHar(req.requestHeaders),
      queryString: queryPairs(req.url),
      bodySize: body ? (req.variablesCutFrom ?? JSON.stringify(body).length) : 0,
      ...(body
        ? {
            postData: {
              mimeType: "application/json",
              text: JSON.stringify(body),
              ...(req.variablesCutFrom !== undefined && {
                comment: cutBodyNote(req.variablesCutFrom),
              }),
            },
          }
        : {}),
    },
    response: {
      status: req.statusCode ?? 0,
      statusText: statusText(req.statusCode),
      httpVersion: req.httpVersion ?? UNKNOWN_VERSION,
      headers: headersToHar(req.responseHeaders),
      content: {
        size: req.size ?? req.dataCutFrom ?? 0,
        mimeType: "application/json",
        text: req.data ? JSON.stringify(req.data) : "",
        ...(req.dataCutFrom !== undefined && { comment: cutBodyNote(req.dataCutFrom) }),
      },
      bodySize: req.size ?? 0,
    },
    timings: {
      send: req.timing?.middleware ?? 0,
      wait: req.timing?.fetch ?? 0,
      receive: req.timing?.parsing ?? 0,
    },
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

export function exportAsHar(session: SavedSession): { log: HarLog } {
  return {
    log: {
      version: "1.2",
      creator: { name: "Courier Studio", version: "1.0.0" },
      entries: session.requests.map(requestToHarEntry),
    },
  };
}
