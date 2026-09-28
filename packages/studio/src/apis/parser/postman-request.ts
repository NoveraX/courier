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
import type { ParsedParameter, ParsedSchema, ParsedSecurityScheme, SpecNode } from "./types";

/** Postman writes an environment reference as `{{name}}`. */
const VARIABLE = /^\{\{(.+)\}\}$/;

/** The path a request addresses, with Postman's variables as path params. */
export function requestPath(url: unknown): string {
  const segments = structuredPath(url);
  if (segments) return segments;

  const raw = typeof url === "string" ? url : ((url as SpecNode)?.raw ?? "");
  /* The host goes without letting the URL parser see `{{…}}`: a leading
     `{{baseUrl}}` is the host, not a parameter of the path. */
  const afterHost = withoutHost(raw).split("?")[0] ?? "";
  return normalizeSegments(afterHost.split("/").filter(Boolean));
}

function structuredPath(url: unknown): string | undefined {
  const parts = (url as SpecNode)?.path;
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
  const node = url as SpecNode | undefined;

  for (const entry of Array.isArray(node?.query) ? node.query : []) {
    if (typeof entry?.key !== "string") continue;
    if (entry.disabled === true) continue;
    parameters.push({
      /* Sent under its own name: `per_page` is not the `per-page` it reads. */
      name: entry.key,
      in: "query",
      required: false,
      type: "string",
      description: typeof entry.description === "string" ? entry.description : "",
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

  const fields = body.mode === "urlencoded" ? body.urlencoded : body.formdata;
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const shape: Record<string, unknown> = {};
  for (const field of fields) {
    if (typeof field?.key !== "string" || field.disabled === true) continue;
    shape[field.key] = field.value ?? "";
  }
  return Object.keys(shape).length > 0 ? inferSchemaFromValue("RequestBody", shape) : null;
}

/** The authentication scheme a collection or a request declares. */
export function authScheme(auth: SpecNode | undefined): ParsedSecurityScheme | undefined {
  const type = auth?.type;
  if (typeof type !== "string") return undefined;

  if (type === "bearer" || type === "oauth2") return { name: type, type: "bearer" };
  if (type === "basic") return { name: type, type: "basic" };
  if (type === "apikey") {
    const entries = Array.isArray(auth?.apikey) ? auth.apikey : [];
    const key = entries.find((e: SpecNode) => e?.key === "key")?.value;
    return {
      name: "apikey",
      type: "apiKey",
      paramName: typeof key === "string" ? key : "Authorization",
      in: "header",
    };
  }
  return { name: type, type: "unknown" };
}
