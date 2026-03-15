import type { RequestEntry } from "@/store/types";

/** Build a cURL command from a request entry */
export function buildCurl(r: RequestEntry): string {
  const parts: string[] = ["curl"];
  const method = r.httpMethod ?? "GET";

  if (method !== "GET") {
    parts.push(`-X ${method}`);
  }

  if (r.url) {
    parts.push(`'${shellEscape(r.url)}'`);
  }

  if (r.requestHeaders) {
    for (const [key, value] of Object.entries(r.requestHeaders)) {
      parts.push(`-H '${shellEscape(`${key}: ${value}`)}'`);
    }
  }

  if (r.variables && method !== "GET") {
    parts.push(`-d '${shellEscape(safeStringify(r.variables))}'`);
  }

  return parts.join(" \\\n  ");
}

/** Build a fetch() snippet from a request entry */
export function buildFetchSnippet(r: RequestEntry): string {
  const method = r.httpMethod ?? "GET";
  const options: string[] = [];

  if (method !== "GET") {
    options.push(`  method: "${method}",`);
  }

  if (r.requestHeaders && Object.keys(r.requestHeaders).length > 0) {
    const headers = Object.entries(r.requestHeaders)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(",\n");
    options.push(`  headers: {\n${headers}\n  },`);
  }

  if (r.variables && method !== "GET") {
    const json = safeStringify(r.variables, 2).replace(/\n/g, "\n  ");
    options.push(`  body: JSON.stringify(${json}),`);
  }

  const url = r.url ?? `/${r.source}/${r.group}/${r.method}`;

  if (options.length === 0) {
    return `const response = await fetch("${url}");`;
  }

  return `const response = await fetch("${url}", {\n${options.join("\n")}\n});`;
}

/** Build a JSON representation of a request entry */
export function buildRequestJson(r: RequestEntry): string {
  return safeStringify({
    id: r.id,
    source: r.source,
    group: r.group,
    method: r.method,
    httpMethod: r.httpMethod,
    mode: r.mode,
    type: r.type,
    status: r.status,
    statusCode: r.statusCode,
    url: r.url,
    variables: r.variables,
    data: r.data,
    timing: r.timing,
    headers: r.headers,
    error: r.error,
  }, 2);
}

function safeStringify(value: unknown, indent = 0): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}

/** Escape single quotes for shell strings */
function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}
