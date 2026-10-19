/**
 * Main spec parser entry point: detects format and delegates to specific parsers.
 */

import { cyclesAsReferences } from "./cycles-as-references";
import { withLeftOutPatterns } from "./left-out-patterns";
import { parseOpenApi3 } from "./parse-openapi3";
import { parsePostman } from "./parse-postman";
import { parseSwagger2 } from "./parse-swagger2";
import { readYaml } from "./read-yaml";
import { fieldOf, isNode } from "./spec-node";
import { splitDirections } from "./split-directions";
import type { ParsedSpec, SpecFormat } from "./types";
import { withUnresolvedRefs } from "./unresolved-refs";

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
 * What the parse leaves out is listed in `skipped`: an operation the
 * builder cannot express, a reference pointing outside the document or at
 * a part it does not hold, and a pattern too long to compile, by where the
 * document writes it.
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
  if (text === "") throw new Error("The specification is empty: there is nothing to import.");
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

  const read: unknown = format.endsWith("-yaml") ? readYaml(text) : json;
  if (!isNode(read)) throw new Error("The specification holds no object at its top level.");
  /* Only YAML's aliases can put an object inside itself. */
  const parsed = format.endsWith("-yaml") ? cyclesAsReferences(read) : read;

  if (format === "postman") return parsePostman(parsed);
  /* The request and the answer a schema describes differ where its fields
     are readOnly or writeOnly: they are typed apart. */
  const parse = format.startsWith("swagger2") ? parseSwagger2 : parseOpenApi3;
  return withUnresolvedRefs(parsed, () =>
    withLeftOutPatterns(parsed, () => splitDirections(parse(parsed))),
  );
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
