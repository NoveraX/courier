/**
 * Extracts endpoint analysis from endpoint() call expressions.
 *
 * Handles multiline patterns like:
 *   getAll: endpoint({ response: z.array(UserSchema), type: "query" })(
 *     (http) => http.get(),
 *   ),
 */

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
  /* Extract config object (first parenthesized block) */
  const configBlock = extractParenBlock(rest);
  if (!configBlock) return null;

  /* After config, find the function call: ((http, vars) => ...) */
  const afterConfig = rest.slice(configBlock.length).trimStart();
  const fnBlock = extractParenBlock(afterConfig);
  const fnContent = fnBlock ?? "";

  /* Parse HTTP method call from function body */
  const httpMatch = fnContent.match(/http\.(get|post|put|patch|del)\(\s*(?:"([^"]*)")?/);
  const method = httpMatch?.[1] ?? "get";
  const path = httpMatch?.[2] ?? "";

  /* Analyze config content */
  const config = configBlock.slice(1, -1);
  const hasResponse = config.includes("response:");
  const hasVariables = config.includes("variables:");
  const hasValidation = hasResponse || hasVariables;

  const typeMatch = config.match(/type:\s*"(query|mutation)"/);
  const type = typeMatch ? (typeMatch[1] as "query" | "mutation") : null;

  const genericParts = generics ? splitGenerics(generics) : [];
  const hasResponseType = genericParts.length >= 1 && genericParts[0] !== "unknown";
  const hasVariablesType = genericParts.length >= 2;

  return {
    hasResponseType: hasResponseType || hasResponse,
    hasVariablesType: hasVariablesType || hasVariables,
    hasValidation,
    httpMethod: method === "del" ? "delete" : method,
    path,
    type,
  };
}

/** Extract content within matched parentheses, handling nesting */
function extractParenBlock(str: string): string | null {
  const start = str.indexOf("(");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") depth--;
    if (depth === 0) return str.slice(start, i + 1);
  }
  return null;
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
