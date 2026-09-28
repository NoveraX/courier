/**
 * Read the parts of a Postman request the generated client needs.
 *
 * A Postman URL is usually a structured object — host segments, path
 * segments, query entries and path variables — and only sometimes a raw
 * string. Reading the raw string and blanking `{{variable}}` with a regular
 * expression turned `{{baseUrl}}/users/{{userId}}` into a path parameter
 * named `host}`, which no caller could supply.
 */

import { inferSchemaFromValue } from "./infer-schema";
import { pathParamName } from "./path-utils";
import { withoutHost } from "./postman-base";
import { fieldOf, nodesAt, textAt } from "./spec-node";
import type { ParsedParameter, ParsedSchema, ParsedSecurityScheme, SpecNode } from "./types";

/** Postman writes an environment reference as `{{name}}`. */
const VARIABLE = /^\{\{(.+)\}\}$/;

/** The path a request addresses, with Postman's variables as path params. */
export function requestPath(url: unknown): string {
  const segments = structuredPath(url);
  if (segments) return segments;

  const raw = typeof url === "string" ? url : (textAt(url, "raw") ?? "");
  /* The host goes without letting the URL parser see `{{…}}`: a leading
     `{{baseUrl}}` is the host, not a parameter of the path. */
  const afterHost = withoutHost(raw).split("?")[0] ?? "";
  return normalizeSegments(afterHost.split("/").filter(Boolean));
}

function structuredPath(url: unknown): string | undefined {
  const parts = fieldOf(url, "path");
  if (!Array.isArray(parts)) return undefined;
  return normalizeSegments(parts.map((part) => String(part)));
}

/** `{{userId}}` and `:userId` both name a path parameter. */
function normalizeSegments(segments: string[]): string {
  const out = segments.map((segment) => {
    const variable = VARIABLE.exec(segment);
    if (variable?.[1]) return `:${pathParamName(variable[1])}`;
    if (segment.startsWith(":")) return `:${pathParamName(segment.slice(1))}`;
    return segment;
  });
  return out.length > 0 ? `/${out.join("/")}` : "/";
}

/** Query entries and path variables the request declares. */
export function requestParameters(url: unknown): ParsedParameter[] {
  const parameters: ParsedParameter[] = [];

  for (const entry of nodesAt(url, "query")) {
    const name = textAt(entry, "key");
    if (name === undefined || entry.disabled === true) continue;
    parameters.push({
      /* Sent under its own name: `per_page` is not the `per-page` it reads. */
      name,
      in: "query",
      required: false,
      type: "string",
      description: textAt(entry, "description") ?? "",
    });
  }

  for (const segment of requestPath(url).split("/")) {
    if (!segment.startsWith(":")) continue;
    parameters.push({
      name: pathParamName(segment.slice(1)),
      in: "path",
      required: true,
      type: "string",
      description: "",
    });
  }

  return parameters;
}

/** The body, whichever of Postman's three modes carries it. */
export function requestBody(body: SpecNode | undefined): ParsedSchema | null {
  if (!body || typeof body !== "object") return null;

  if (body.mode === "raw" && typeof body.raw === "string") {
    try {
      return inferSchemaFromValue("RequestBody", JSON.parse(body.raw));
    } catch {
      /* A raw body that is not JSON describes no shape worth generating. */
      return null;
    }
  }

  const fields = nodesAt(body, body.mode === "urlencoded" ? "urlencoded" : "formdata");
  if (fields.length === 0) return null;

  const shape: Record<string, unknown> = {};
  for (const field of fields) {
    const key = textAt(field, "key");
    if (key === undefined || field.disabled === true) continue;
    shape[key] = fieldOf(field, "value") ?? "";
  }
  return Object.keys(shape).length > 0 ? inferSchemaFromValue("RequestBody", shape) : null;
}

/** Media type of each body mode `requestBody` reads a shape from; a raw one only when it is JSON. */
const MODE_MEDIA_TYPES: ReadonlyMap<unknown, string> = new Map([
  ["raw", "application/json"],
  ["urlencoded", "application/x-www-form-urlencoded"],
  ["formdata", "multipart/form-data"],
]);

/**
 * The media type a body is sent as.
 *
 * @param body - The request's body
 * @returns The type its mode sends, or `undefined` for a mode with no shape to read
 * @example
 * ```ts
 * requestBodyMediaType({ mode: "urlencoded", urlencoded: [] }); // → "application/x-www-form-urlencoded"
 * ```
 */
export function requestBodyMediaType(body: SpecNode | undefined): string | undefined {
  return MODE_MEDIA_TYPES.get(body?.mode);
}

/** The authentication scheme a collection or a request declares. */
export function authScheme(auth: SpecNode | undefined): ParsedSecurityScheme | undefined {
  const type = auth?.type;
  if (typeof type !== "string") return undefined;

  if (type === "bearer" || type === "oauth2") return { name: type, type: "bearer" };
  if (type === "basic") return { name: type, type: "basic" };
  if (type === "apikey") {
    const entries = nodesAt(auth, "apikey");
    const key = fieldOf(
      entries.find((entry) => entry.key === "key"),
      "value",
    );
    return {
      name: "apikey",
      type: "apiKey",
      paramName: typeof key === "string" ? key : "Authorization",
      in: "header",
    };
  }
  return { name: type, type: "unknown" };
}
