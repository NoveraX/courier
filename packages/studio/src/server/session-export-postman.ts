/**
 * Session export — Postman collection format.
 */

import { cutBodyNote } from "./cut-body-note";
import { sentRequest, statusText } from "./session-export-utils";
import type { SavedRequest, SavedSession } from "./session-types";

// ── Types ──────────────────────────────────────────────────────────────────

interface PostmanCollection {
  info: { name: string; schema: string };
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    url: string;
    header: Array<{ key: string; value: string }>;
    body?: { mode: string; raw: string; options: { raw: { language: string } } };
    description?: string;
  };
  response: PostmanResponse[];
}

interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  header: Array<{ key: string; value: string }>;
  body: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function requestToPostmanItem(req: SavedRequest): PostmanItem {
  const label = `${req.source}.${req.group ?? ""}.${req.method}`;
  const headers = req.requestHeaders
    ? Object.entries(req.requestHeaders).map(([key, value]) => ({ key, value }))
    : [];
  const { method, body } = sentRequest(req);

  return {
    name: label,
    request: {
      method,
      url: req.url ?? label,
      header: headers,
      ...(body
        ? {
            body: {
              mode: "raw",
              raw: JSON.stringify(body, null, 2),
              options: { raw: { language: "json" } },
            },
          }
        : {}),
      ...(req.variablesCutFrom !== undefined && {
        description: cutBodyNote(req.variablesCutFrom),
      }),
    },
    response: [
      {
        name:
          req.dataCutFrom === undefined
            ? `${req.statusCode ?? 0} response`
            : `${req.statusCode ?? 0} response — ${cutBodyNote(req.dataCutFrom)}`,
        status: statusText(req.statusCode),
        code: req.statusCode ?? 0,
        header: req.responseHeaders
          ? Object.entries(req.responseHeaders).map(([key, value]) => ({ key, value }))
          : [],
        body: req.data ? JSON.stringify(req.data, null, 2) : "",
      },
    ],
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

export function exportAsPostman(session: SavedSession): PostmanCollection {
  return {
    info: {
      name: `Courier Studio — ${session.name}`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    /* Requests to send again: a read answered by another call's request is that call's request. */
    item: session.requests.filter((req) => req.shared === undefined).map(requestToPostmanItem),
  };
}
