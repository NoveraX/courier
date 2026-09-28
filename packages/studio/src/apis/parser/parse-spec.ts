/**
 * Main spec parser entry point: detects format and delegates to specific parsers.
 */

import { parse as parseYaml } from "yaml";
import { parseOpenApi3 } from "./parse-openapi3";
import { parsePostman } from "./parse-postman";
import { parseSwagger2 } from "./parse-swagger2";
import { fieldOf, isNode } from "./spec-node";
import { splitDirections } from "./split-directions";
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
  return text.startsWith("{") ? jsonFormat(readJson(text)) : yamlFormat(text);
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
  const text = raw.trim();
  /* A JSON specification is read once: its format is told from the document
     it is read into. Read once to tell the format and again to parse it,
     Stripe's 7 MB took twice as long. */
  const json = text.startsWith("{") ? readJson(text) : undefined;
  const format = text.startsWith("{") ? jsonFormat(json) : yamlFormat(text);

  if (format === "unknown") {
    throw new Error(
      "Unable to detect spec format. Supported: OpenAPI 3.x (JSON/YAML), Swagger 2.0 (JSON/YAML), Postman Collection.",
    );
  }

  const parsed: unknown = format.endsWith("-yaml") ? parseYaml(text) : json;
  if (!isNode(parsed)) throw new Error("The specification holds no object at its top level.");

  if (format === "postman") return parsePostman(parsed);
  /* The request and the answer a schema describes differ where its fields
     are readOnly or writeOnly: they are typed apart. */
  if (format.startsWith("swagger2")) return splitDirections(parseSwagger2(parsed));
  return splitDirections(parseOpenApi3(parsed));
}

/* The document the text holds, or `undefined` when it is not JSON — which no
   JSON document can be, so the caller tells the format as unknown. */
function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function jsonFormat(document: unknown): SpecFormat {
  if (String(fieldOf(document, "openapi") ?? "").startsWith("3")) return "openapi3-json";
  if (String(fieldOf(document, "swagger") ?? "").startsWith("2")) return "swagger2-json";
  if (fieldOf(document, "info") && fieldOf(document, "item")) return "postman";
  return "unknown";
}

function yamlFormat(text: string): SpecFormat {
  const key = YAML_VERSION_KEY.exec(text)?.[2];
  if (key === "openapi") return "openapi3-yaml";
  if (key === "swagger") return "swagger2-yaml";
  return "unknown";
}
