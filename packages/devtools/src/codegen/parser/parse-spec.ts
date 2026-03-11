/**
 * Main spec parser entry point: detects format and delegates to specific parsers.
 */

import { parse as parseYaml } from "yaml";
import { parseOpenApi3 } from "./parse-openapi3";
import { parsePostman } from "./parse-postman";
import { parseSwagger2 } from "./parse-swagger2";
import type { ParsedSpec, SpecFormat } from "./types";

export function detectFormat(raw: string): SpecFormat {
  const trimmed = raw.trim();

  // Try JSON first
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj.openapi?.startsWith("3")) return "openapi3-json";
      if (obj.swagger?.startsWith("2")) return "swagger2-json";
      if (obj.info && obj.item) return "postman";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  // Try YAML
  if (trimmed.startsWith("openapi:") || trimmed.includes("\nopenapi:")) return "openapi3-yaml";
  if (trimmed.startsWith("swagger:") || trimmed.includes("\nswagger:")) return "swagger2-yaml";

  return "unknown";
}

export function parseSpec(raw: string): ParsedSpec {
  const format = detectFormat(raw);

  if (format === "unknown") {
    throw new Error(
      "Unable to detect spec format. Supported: OpenAPI 3.x (JSON/YAML), Swagger 2.0 (JSON/YAML), Postman Collection.",
    );
  }

  const parsed = format.endsWith("-yaml") ? parseYaml(raw) : JSON.parse(raw);

  if (format === "postman") return parsePostman(parsed);
  if (format.startsWith("swagger2")) return parseSwagger2(parsed);
  return parseOpenApi3(parsed);
}
