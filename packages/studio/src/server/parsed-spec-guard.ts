import { isRecord } from "@noverax/courier-cli/devkit";
import type { ParsedSpec } from "../apis";
import { SUPPORTED_METHODS } from "../apis/parser/http-methods";

const FORMATS: ReadonlySet<unknown> = new Set(["openapi3", "swagger2", "postman"]);
/* Every verb the parser gives an endpoint; a list of its own left HEAD out,
   so a spec with a HEAD operation could be parsed and never written. */
const METHODS: ReadonlySet<unknown> = new Set(SUPPORTED_METHODS);

/**
 * Tell whether a request body's spec has the shape Studio's parser gives a
 * spec, as far as the generator relies on it before it can fail by itself:
 * the spec's own fields, its groups, and each endpoint's name, method and
 * paths. A schema malformed deeper than that makes generation fail, which
 * the routes answer 400.
 *
 * @param value - A spec from a request body
 * @returns `true` when it has that shape
 * @example
 * ```ts
 * if (!isParsedSpec(body.spec)) return res.status(400).json({ error: "Invalid spec" });
 * ```
 */
export function isParsedSpec(value: unknown): value is ParsedSpec {
  if (!isRecord(value)) return false;
  const {
    title,
    version,
    description,
    baseURL,
    format,
    groups,
    schemas,
    securitySchemes,
    skipped,
  } = value;
  return (
    [title, version, description, baseURL].every((field) => typeof field === "string") &&
    FORMATS.has(format) &&
    Array.isArray(groups) &&
    groups.every(isGroup) &&
    isRecord(schemas) &&
    Object.values(schemas).every(isRecord) &&
    Array.isArray(securitySchemes) &&
    Array.isArray(skipped)
  );
}

function isGroup(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { name, description, prefix, endpoints } = value;
  return (
    typeof name === "string" &&
    typeof description === "string" &&
    typeof prefix === "string" &&
    Array.isArray(endpoints) &&
    endpoints.every(isEndpoint)
  );
}

function isEndpoint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { name, httpMethod, path, fullPath, parameters, tags } = value;
  return (
    typeof name === "string" &&
    METHODS.has(httpMethod) &&
    typeof path === "string" &&
    typeof fullPath === "string" &&
    Array.isArray(parameters) &&
    parameters.every(isRecord) &&
    Array.isArray(tags)
  );
}
