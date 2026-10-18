/**
 * Read the bodies the session routes take. Each reader returns what the
 * route needs, or the refusal to answer with: 400 for a body Studio cannot
 * read, 413 for a session larger than Studio saves.
 */

import type { SavedSessionApp } from "./session-types";
import { isObject } from "./validate-body";

/** The most calls a saved session holds: the most the UI keeps. */
export const MAX_SESSION_REQUESTS = 10_000;

/* The ids Studio gives sessions, and nothing a path could be made of. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

const EXPORT_FORMATS = ["har", "json", "postman"] as const;

/** A format Studio exports requests in. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** A request a session route refuses, and the status to answer it with. */
export interface SessionRefusal {
  error: string;
  status: 400 | 413;
}

/** What saving a session takes. */
export interface SaveRequest {
  name?: string;
  requests: Record<string, unknown>[];
  apps: SavedSessionApp[];
}

function refuse(error: string, status: 400 | 413 = 400): SessionRefusal {
  return { error, status };
}

function isApp(value: unknown): value is SavedSessionApp {
  if (!isObject(value)) return false;
  const { sessionId, framework, courierVersion, connectedAt } = value;
  return (
    [sessionId, framework, courierVersion].every((v) => typeof v === "string") &&
    typeof connectedAt === "number"
  );
}

/**
 * Read the body of a save: the requests the UI captured, each an object,
 * the apps they came from, and an optional name.
 *
 * @param body - The request body, as parsed
 * @returns What to save, or the refusal
 * @example
 * ```ts
 * const read = readSaveBody(req.body);
 * if ("error" in read) res.status(read.status).json({ error: read.error });
 * ```
 */
export function readSaveBody(body: unknown): SaveRequest | SessionRefusal {
  if (!isObject(body)) return refuse("Send the session as a JSON object.");
  const { name, requests, apps = [] } = body;
  if (name !== undefined && typeof name !== "string") return refuse("name must be a string.");
  if (!Array.isArray(requests)) return refuse("requests must be a list of the captured requests.");
  if (requests.length > MAX_SESSION_REQUESTS) {
    return refuse(`A session holds at most ${MAX_SESSION_REQUESTS} calls.`, 413);
  }
  if (!requests.every(isObject)) return refuse("Every request must be an object.");
  if (!Array.isArray(apps) || !apps.every(isApp)) return refuse("apps must be a list of apps.");
  return { ...(name !== undefined && { name }), requests, apps };
}

/**
 * Tell whether a value is a session id Studio could have given.
 *
 * @param value - The value
 * @returns `true` for 1 to 64 letters, digits, `-` and `_`
 * @example
 * ```ts
 * isSessionId("3f2a9c1e"); // true
 * isSessionId("../package"); // false
 * ```
 */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value);
}

/**
 * Read the session id a load or a delete names.
 *
 * @param body - The request body, as parsed
 * @returns The id, or the refusal
 */
export function readIdBody(body: unknown): { id: string } | SessionRefusal {
  if (!isObject(body)) return refuse("Send the session's id as a JSON object.");
  return isSessionId(body.id) ? { id: body.id } : refuse("id must be a session id.");
}

function formatOf(body: unknown): ExportFormat | SessionRefusal {
  const format = isObject(body) ? EXPORT_FORMATS.find((known) => known === body.format) : undefined;
  return format ?? refuse("format must be har, json or postman.");
}

/**
 * Read the session id and the format an export names.
 *
 * @param body - The request body, as parsed
 * @returns The id and the format, or the refusal
 */
export function readExportBody(
  body: unknown,
): { id: string; format: ExportFormat } | SessionRefusal {
  const read = readIdBody(body);
  if ("error" in read) return read;
  const format = formatOf(body);
  return typeof format === "string" ? { id: read.id, format } : format;
}

/**
 * Read an export of the requests a page holds, unsaved: the requests and
 * the apps they came from, as a save takes them, and the format.
 *
 * @param body - The request body, as parsed
 * @returns What to export and how, or the refusal
 * @example
 * ```ts
 * const read = readLiveExportBody(req.body);
 * if (!("error" in read)) res.json(exportAsHar(buildSession(read)));
 * ```
 */
export function readLiveExportBody(
  body: unknown,
): (SaveRequest & { format: ExportFormat }) | SessionRefusal {
  const read = readSaveBody(body);
  if ("error" in read) return read;
  const format = formatOf(body);
  return typeof format === "string" ? { ...read, format } : format;
}
