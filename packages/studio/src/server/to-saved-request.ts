import { cutText, readShared, urlWithoutSecrets } from "@noverax/courier-studio-core";

import { cutCause } from "./secrets/cut-cause";
import type { SavedRequest } from "./session-types";
import { headersWithoutCredentials } from "./storage/without-credentials";
import { isObject } from "./validate-body";

function optionalString(value: unknown): string | undefined {
  return value != null ? String(value) : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/* An object whose every value is of one type, or nothing. */
function recordOf<TValue>(
  value: unknown,
  is: (item: unknown) => item is TValue,
): Record<string, TValue> | undefined {
  if (!isObject(value)) return undefined;
  const record: Record<string, TValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!is(item)) return undefined;
    record[key] = item;
  }
  return record;
}

const isNumber = (item: unknown): item is number => typeof item === "number";
const isString = (item: unknown): item is string => typeof item === "string";

function errorOf(value: unknown): SavedRequest["error"] {
  if (!isObject(value) || typeof value.message !== "string") return undefined;
  const status = optionalNumber(value.status);
  /* A saved session is written down and handed around: its texts leave the token page, cut. */
  const cause = cutCause(value.cause);
  return {
    type: String(value.type ?? "unknown"),
    ...(status !== undefined && { status }),
    message: cutText(value.message),
    ...(cause && { cause }),
  };
}

/**
 * A request as a saved session keeps it, from the request as the UI store
 * held it: each field read in the shape Studio gave it, and — as a session
 * is written down and handed around — its headers, its address and its
 * error's texts without their credentials.
 *
 * @param raw - The request, as the page sent it
 * @returns The saved request
 * @example
 * ```ts
 * toSavedRequest({ id: "r1", source: "api", method: "me", url: "https://ana:pw@api.test/me" }).url;
 * // "https://api.test/me"
 * ```
 */
export function toSavedRequest(raw: Record<string, unknown>): SavedRequest {
  return {
    id: String(raw.id ?? ""),
    source: String(raw.source ?? ""),
    group: optionalString(raw.group),
    method: String(raw.method ?? ""),
    httpMethod: optionalString(raw.httpMethod),
    variables: raw.variables,
    variablesCutFrom: optionalNumber(raw.variablesCutFrom),
    mode: raw.mode === "proxy" || raw.mode === "webhook" ? raw.mode : "direct",
    type: raw.type === "mutation" ? "mutation" : raw.type === "query" ? "query" : undefined,
    status: String(raw.status ?? "pending"),
    statusCode: optionalNumber(raw.statusCode),
    timing: recordOf(raw.timing, isNumber),
    size: optionalNumber(raw.size),
    data: raw.data,
    dataCutFrom: optionalNumber(raw.dataCutFrom),
    requestHeaders: credentialFree(recordOf(raw.requestHeaders, isString)),
    responseHeaders: credentialFree(recordOf(raw.headers ?? raw.responseHeaders, isString)),
    error: errorOf(raw.error),
    startedAt: optionalNumber(raw.startedAt) ?? Date.now(),
    url: typeof raw.url === "string" ? urlWithoutSecrets(raw.url) : undefined,
    httpVersion: httpVersionOf(raw.httpVersion),
    sessionId: String(raw.sessionId ?? ""),
    callerRuntimeId: optionalString(raw.callerRuntimeId),
    agent: agentOf(raw.agent),
    idempotencyKey: optionalString(raw.idempotencyKey),
    shared: readShared(raw.shared),
  };
}

const ACCESS: ReadonlySet<string> = new Set(["read", "write", "destructive"]);

/* The agent a request ran for, kept only when the page says it in the shape Studio gave it. */
function agentOf(value: unknown): SavedRequest["agent"] {
  if (typeof value !== "object" || value === null) return undefined;
  const { tool, access, client } = value as Record<string, unknown>;
  if (typeof tool !== "string" || typeof access !== "string" || !ACCESS.has(access))
    return undefined;
  return {
    tool,
    access: access as "read" | "write" | "destructive",
    ...(typeof client === "string" && { client }),
  };
}

const HTTP_VERSIONS: ReadonlySet<string> = new Set(["HTTP/1.0", "HTTP/1.1", "HTTP/2", "HTTP/3"]);

/* A version the page says a request went over, kept only when it is one. */
function httpVersionOf(value: unknown): string | undefined {
  return typeof value === "string" && HTTP_VERSIONS.has(value) ? value : undefined;
}

/* A session is written down and exported to be handed around: no credentials go with it. */
function credentialFree(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  return headers && headersWithoutCredentials(headers);
}
