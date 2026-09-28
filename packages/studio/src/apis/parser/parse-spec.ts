/**
 * Main spec parser entry point: detects format and delegates to specific parsers.
 */

import { parse as parseYaml } from "yaml";
import { parseOpenApi3 } from "./parse-openapi3";
import { parsePostman } from "./parse-postman";
import { parseSwagger2 } from "./parse-swagger2";
import { fieldOf, isNode } from "./spec-node";
import type { ParsedSpec, SpecFormat } from "./types";

/**
 * A top-level `openapi` or `swagger` key, quoted or not: at the start of a
 * line, so a nested key of the same name is not taken for it.
 */
const YAML_VERSION_KEY = /^(["']?)(openapi|swagger)\1[ \t]*:/m;

/**
 * Tell which kind of specification a text holds.
 *
 * A byte order mark, which Windows editors write at the start of a UTF-8
 * file, is ignored; `JSON.parse` refuses the text while it is there.
 *
 * @param raw - The text as it was read or pasted
 * @returns The format, or `"unknown"` when the text is none Studio reads
 * @example
 * ```ts
 * detectFormat('"openapi": 3.0.4\ninfo: …'); // → "openapi3-yaml"
 * ```
 */
export function detectFormat(raw: string): SpecFormat {
  const text = raw.trim();

  if (text.startsWith("{")) {
    try {
      const document: unknown = JSON.parse(text);
      if (String(fieldOf(document, "openapi") ?? "").startsWith("3")) return "openapi3-json";
      if (String(fieldOf(document, "swagger") ?? "").startsWith("2")) return "swagger2-json";
      if (fieldOf(document, "info") && fieldOf(document, "item")) return "postman";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  const key = YAML_VERSION_KEY.exec(text)?.[2];
  if (key === "openapi") return "openapi3-yaml";
  if (key === "swagger") return "swagger2-yaml";
  return "unknown";
}

/**
 * Parse an OpenAPI 3, Swagger 2 or Postman specification, as JSON or YAML.
 *
 * @param raw - The text as it was read or pasted
 * @returns The parsed specification
 * @throws Error when the text is no specification Studio reads, does not
 *   parse, or holds something other than an object at its top level
 * @example
 * ```ts
 * const spec = parseSpec(readFileSync("openapi.json", "utf8"));
 * ```
 */
export function parseSpec(raw: string): ParsedSpec {
  const format = detectFormat(raw);

  if (format === "unknown") {
    throw new Error(
      "Unable to detect spec format. Supported: OpenAPI 3.x (JSON/YAML), Swagger 2.0 (JSON/YAML), Postman Collection.",
    );
  }

  const text = raw.trim();
  const parsed: unknown = format.endsWith("-yaml") ? parseYaml(text) : JSON.parse(text);
  if (!isNode(parsed)) throw new Error("The specification holds no object at its top level.");

  if (format === "postman") return parsePostman(parsed);
  if (format.startsWith("swagger2")) return parseSwagger2(parsed);
  return parseOpenApi3(parsed);
}
