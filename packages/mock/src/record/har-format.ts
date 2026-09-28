/** Minimal HAR 1.2 types for Courier fixtures */

export interface HarLog {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: HarHeader[];
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: HarHeader[];
    content: { size: number; mimeType: string; text: string };
  };
  /** Courier-specific metadata */
  _courier: {
    group: string;
    method: string;
    variables?: unknown;
  };
}

interface HarHeader {
  name: string;
  value: string;
}

/** Create an empty HAR log */
export function createHarLog(): HarLog {
  return {
    log: {
      version: "1.2",
      creator: { name: "@noverax/courier-mock", version: "0.0.0" },
      entries: [],
    },
  };
}

/**
 * Create a HAR entry from a recorded request/response. `startedDateTime` is
 * when the request started — a fixture's `recordedAt` — and never the time
 * the HAR is written, so a fixture keeps its date through a HAR round trip.
 */
export function createHarEntry(params: {
  startedDateTime: string;
  group: string;
  method: string;
  variables?: unknown;
  url: string;
  httpMethod: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  duration: number;
}): HarEntry {
  return {
    startedDateTime: params.startedDateTime,
    time: params.duration,
    request: {
      method: params.httpMethod,
      url: params.url,
      headers: toHarHeaders(params.requestHeaders),
      postData: params.requestBody
        ? { mimeType: "application/json", text: params.requestBody }
        : undefined,
    },
    response: {
      status: params.status,
      statusText: params.statusText,
      headers: toHarHeaders(params.responseHeaders),
      content: {
        size: params.responseBody.length,
        mimeType: "application/json",
        text: params.responseBody,
      },
    },
    _courier: {
      group: params.group,
      method: params.method,
      variables: params.variables,
    },
  };
}

function toHarHeaders(headers: Record<string, string>): HarHeader[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/** Parse HAR headers back to a plain object */
export function fromHarHeaders(headers: HarHeader[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { name, value } of headers) {
    result[name] = value;
  }
  return result;
}
