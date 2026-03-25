/**
 * Extracts endpoint analysis from endpoint() call expressions.
 *
 * Handles multiline patterns like:
 *   getAll: endpoint({ response: z.array(UserSchema), type: "query" })(
 *     (http) => http.get(),
 *   ),
 */

import { normalizeHttpMethod } from "@noverax/nexus";
import { extractBalancedBlock } from "./parse-utils";
import type { EndpointAnalysis, ScannedEndpoint } from "./types";

/** Find `name: endpoint` markers and parse each one */
export function extractEndpoints(endpointsBlock: string): ScannedEndpoint[] {
  const results: ScannedEndpoint[] = [];
  const markerRe = /(\w+)\s*:\s*endpoint\s*(?:<([^>]*)>)?\s*\(/g;

  for (const match of endpointsBlock.matchAll(markerRe)) {
    const name = match[1];
    if (!name) continue;

    const generics = match[2];
    const afterMarker = endpointsBlock.slice(match.index + match[0].length - 1);
    const analysis = parseEndpointCall(generics, afterMarker);
    if (analysis) results.push({ name, analysis });
  }

  return results;
}

/** Parse the endpoint(...)(fn) call after the marker */
function parseEndpointCall(generics: string | undefined, rest: string): EndpointAnalysis | null {
  const configBlock = extractParenBlock(rest);
  if (!configBlock) return null;

  const { method, path } = extractHttpCall(rest, configBlock);
  const config = analyzeConfig(configBlock, generics);

  return {
    hasResponseType: config.hasResponseType,
    hasVariablesType: config.hasVariablesType,
    hasValidation: config.hasValidation,
    httpMethod: normalizeHttpMethod(method).toLowerCase() as EndpointAnalysis["httpMethod"],
    path,
    type: config.type,
  };
}

function extractHttpCall(rest: string, configBlock: string): { method: string; path: string } {
  const afterConfig = rest.slice(configBlock.length).trimStart();
  const fnBlock = extractParenBlock(afterConfig) ?? "";
  const httpMatch = fnBlock.match(/http\.(get|post|put|patch|del)\(\s*(?:"([^"]*)")?/);
  return { method: httpMatch?.[1] ?? "get", path: httpMatch?.[2] ?? "" };
}

function analyzeConfig(configBlock: string, generics: string | undefined) {
  const config = configBlock.slice(1, -1);
  const hasResponse = config.includes("response:");
  const hasVariables = config.includes("variables:");
  const typeMatch = config.match(/type:\s*"(query|mutation)"/);

  const genericParts = generics ? splitGenerics(generics) : [];
  const hasResponseType = genericParts.length >= 1 && genericParts[0] !== "unknown";

  return {
    hasResponseType: hasResponseType || hasResponse,
    hasVariablesType: genericParts.length >= 2 || hasVariables,
    hasValidation: hasResponse || hasVariables,
    type: typeMatch ? (typeMatch[1] as "query" | "mutation") : null,
  };
}

/** Extract content within matched parentheses, handling nesting */
function extractParenBlock(str: string): string | null {
  const start = str.indexOf("(");
  if (start < 0) return null;
  return extractBalancedBlock(str, start, "(", ")");
}

/** Split generic parameters handling nested angle brackets */
function splitGenerics(generics: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of generics) {
    if (char === "<" || char === "{") depth++;
    else if (char === ">" || char === "}") depth--;
    else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}
