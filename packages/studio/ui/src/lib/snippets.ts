/**
 * Shared snippet builders for cURL / fetch — used by both Timeline and Playground.
 */

export interface SnippetInput {
  url: string;
  method: string;
  headers?: Record<string, string> | undefined;
  body?: unknown;
}

/** Build a cURL command */
export function buildCurlSnippet(input: SnippetInput): string {
  const { url, method, body } = input;
  const headers = mergeContentType(input.headers, body, method);
  const parts: string[] = ["curl"];
  if (method !== "GET") parts.push(`-X ${method}`);
  parts.push(`'${shellEscape(url)}'`);
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H '${shellEscape(`${k}: ${v}`)}'`);
  }
  if (body && method !== "GET") {
    parts.push(`-d '${shellEscape(safeStringify(body))}'`);
  }
  return parts.join(" \\\n  ");
}

/** Build a fetch() snippet */
export function buildFetchSnippet(input: SnippetInput): string {
  const { url, method, body } = input;
  const headers = mergeContentType(input.headers, body, method);
  const opts: string[] = [];
  if (method !== "GET") opts.push(`  method: "${method}",`);

  if (Object.keys(headers).length > 0) {
    const hdrStr = Object.entries(headers)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(",\n");
    opts.push(`  headers: {\n${hdrStr}\n  },`);
  }

  if (body && method !== "GET") {
    const json = safeStringify(body, 2).replace(/\n/g, "\n  ");
    opts.push(`  body: JSON.stringify(${json}),`);
  }

  if (opts.length === 0) return `const response = await fetch("${url}");`;
  return `const response = await fetch("${url}", {\n${opts.join("\n")}\n});`;
}

/** Auto-add Content-Type: application/json when body is present */
function mergeContentType(
  headers: Record<string, string> | undefined,
  body: unknown,
  method: string,
): Record<string, string> {
  const merged = { ...headers };
  if (body && method !== "GET") {
    const hasContentType = Object.keys(merged).some((k) => k.toLowerCase() === "content-type");
    if (!hasContentType) merged["Content-Type"] = "application/json";
  }
  return merged;
}

export function safeStringify(value: unknown, indent = 0): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}
