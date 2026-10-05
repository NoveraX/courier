/**
 * Session export — Postman collection format.
 */

import { cutBodyNote } from "./cut-body-note";
import { statusText } from "./session-export-utils";
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

  return {
    name: label,
    request: {
      method: (req.httpMethod ?? "GET").toUpperCase(),
      url: req.url ?? label,
      header: headers,
      ...(req.variables
        ? {
            body: {
              mode: "raw",
              raw: JSON.stringify(req.variables, null, 2),
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
    item: session.requests.map(requestToPostmanItem),
  };
}
