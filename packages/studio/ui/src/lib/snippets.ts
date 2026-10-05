/**
 * Shared snippet builders for cURL / fetch — used by both Timeline and Playground.
 */

export interface SnippetInput {
  url: string;
  method: string;
  headers?: Record<string, string> | undefined;
  body?: unknown;
  /** A file that holds the body, sent in place of `body`: one too large to write out. */
  bodyFile?: string | undefined;
}

/** Build a cURL command */
export function buildCurlSnippet(input: SnippetInput): string {
  const { url, method, body, bodyFile } = input;
  const headers = mergeContentType(input.headers, bodyFile ?? body, method);
  const parts: string[] = ["curl"];
  if (method !== "GET") parts.push(`-X ${method}`);
  parts.push(`'${shellEscape(url)}'`);
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H '${shellEscape(`${k}: ${v}`)}'`);
  }
  if (bodyFile !== undefined && method !== "GET") {
    parts.push(`--data-binary '@${shellEscape(bodyFile)}'`);
  } else if (body && method !== "GET") {
    parts.push(`-d '${shellEscape(safeStringify(body))}'`);
  }
  return parts.join(" \\\n  ");
}

/** Build a fetch() snippet */
export function buildFetchSnippet(input: SnippetInput): string {
  const { url, method, body, bodyFile } = input;
  const headers = mergeContentType(input.headers, bodyFile ?? body, method);
  const opts: string[] = [];
  if (method !== "GET") opts.push(`  method: "${method}",`);

  if (Object.keys(headers).length > 0) {
    const hdrStr = Object.entries(headers)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(",\n");
    opts.push(`  headers: {\n${hdrStr}\n  },`);
  }

  if (bodyFile !== undefined && method !== "GET") {
    opts.push("  body: JSON.stringify(wholeBody),");
  } else if (body && method !== "GET") {
    const json = safeStringify(body, 2).replace(/\n/g, "\n  ");
    opts.push(`  body: JSON.stringify(${json}),`);
  }

  const lead = bodyFile !== undefined && method !== "GET" ? `${wholeBodyNote(bodyFile)}\n` : "";
  if (opts.length === 0) return `${lead}const response = await fetch("${url}");`;
  return `${lead}const response = await fetch("${url}", {\n${opts.join("\n")}\n});`;
}

/**
 * The line over a snippet whose body is too large to write out: where the
 * whole body is, for the `wholeBody` the snippet sends.
 *
 * @param bodyFile - The file the whole body downloads as
 * @returns The comment
 * @example
 * ```ts
 * wholeBodyNote("api.orders.create-request.json"); // "// wholeBody: the whole body, as Download whole saves it in api.orders.create-request.json"
 * ```
 */
export function wholeBodyNote(bodyFile: string): string {
  return `// wholeBody: the whole body, as Download whole saves it in ${bodyFile}`;
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
