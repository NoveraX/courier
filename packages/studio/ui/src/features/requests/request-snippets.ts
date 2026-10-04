import { buildCurlSnippet, buildFetchSnippet, safeStringify } from "@/lib/snippets";
import type { RequestEntry } from "@/store/types";
import { isCredentialHeader } from "./credential-headers";
import { httpMethodOf } from "./request-parts";

/** The ways a request can be written out: a shell command, browser code, a Courier call. */
export type SnippetFlavor = "shell" | "browser" | "courier";

/** A request written out, and whether a credential was left out of it. */
export interface Snippet {
  code: string;
  redacted: boolean;
}

/** What a credential's value reads as in a snippet. */
export const REDACTED_VALUE = "<redacted>";

const LABELS: Readonly<Record<"http" | "sse" | "ws", Record<SnippetFlavor, string>>> = {
  http: { shell: "cURL", browser: "fetch", courier: "Courier" },
  sse: { shell: "cURL", browser: "Browser", courier: "Courier" },
  ws: { shell: "websocat", browser: "Browser", courier: "Courier" },
};

/**
 * What each flavour of snippet is called for a request: cURL, fetch and a
 * Courier call for HTTP; for a stream, the shell tool and the browser API
 * that open it.
 *
 * @param r - The request
 * @returns The label per flavour
 * @example
 * ```ts
 * snippetLabels({ transport: "ws" }).shell; // "websocat"
 * ```
 */
export function snippetLabels(r: Pick<RequestEntry, "transport">): Record<SnippetFlavor, string> {
  return LABELS[r.transport ?? "http"];
}

function redactedHeaders(headers: RequestEntry["requestHeaders"]): {
  headers: Record<string, string>;
  redacted: boolean;
} {
  let redacted = false;
  const entries = Object.entries(headers ?? {}).map(([name, value]): [string, string] => {
    if (!isCredentialHeader(name)) return [name, value];
    redacted = true;
    return [name, REDACTED_VALUE];
  });
  return { headers: Object.fromEntries(entries), redacted };
}

function courierArgs(variables: unknown): string {
  if (variables === undefined || variables === null) return "";
  if (typeof variables === "object" && Object.keys(variables).length === 0) return "";
  return safeStringify(variables, 2).replace(/"([A-Za-z_$][\w$]*)":/g, "$1:");
}

function courierCall(r: RequestEntry): string {
  const path = r.group ? `${r.group}.${r.method}` : r.method;
  const call = `caller.${path}(${courierArgs(r.variables)})`;
  if (r.transport === "sse")
    return `for await (const event of ${call}) {\n  console.log(event.data);\n}`;
  if (r.transport === "ws") {
    return `const channel = ${call};\n\nchannel.on("data", (message) => console.log(message));`;
  }
  return `const data = await ${call};`;
}

function streamShell(r: RequestEntry, url: string, headers: Record<string, string>): string {
  const flags = Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`);
  if (r.transport === "ws") return ["websocat", `'${url}'`, ...flags].join(" \\\n  ");
  return ["curl -N", `'${url}'`, "-H 'accept: text/event-stream'", ...flags].join(" \\\n  ");
}

function streamBrowser(r: RequestEntry, url: string): string {
  if (r.transport === "ws") {
    return `const socket = new WebSocket("${url}");\n\nsocket.onmessage = (event) => console.log(JSON.parse(event.data));`;
  }
  const named = r.streamEvents?.find((e) => e.eventType && e.eventType !== "data")?.eventType;
  const listen = named
    ? `events.addEventListener("${named}", (event) => console.log(JSON.parse(event.data)));`
    : "events.onmessage = (event) => console.log(JSON.parse(event.data));";
  return `const events = new EventSource("${url}");\n\n${listen}`;
}

/**
 * A request written out in a flavour, with the values of credential
 * headers left out — the Headers tab shows them, on request.
 *
 * @param r - The request
 * @param flavor - The flavour
 * @returns The snippet, and whether a credential was left out
 * @example
 * ```ts
 * requestSnippet(request, "shell").code; // "curl -X POST 'http://…' \\\n  -H 'authorization: <redacted>'"
 * ```
 */
export function requestSnippet(r: RequestEntry, flavor: SnippetFlavor): Snippet {
  const url = r.url ?? `/${[r.source, r.group, r.method].filter(Boolean).join("/")}`;
  const { headers, redacted } = redactedHeaders(r.requestHeaders);
  if (flavor === "courier") return { code: courierCall(r), redacted: false };
  if (r.transport === "sse" || r.transport === "ws") {
    return flavor === "shell"
      ? { code: streamShell(r, url, headers), redacted }
      : { code: streamBrowser(r, url), redacted: false };
  }
  const input = { url, method: httpMethodOf(r), headers, body: r.sentBody ?? r.variables };
  const code = flavor === "shell" ? buildCurlSnippet(input) : buildFetchSnippet(input);
  return { code, redacted };
}

/**
 * A request as JSON, to copy or download: what identifies it, how it went,
 * its variables and its answer — its headers left out, credentials among
 * them.
 *
 * @param r - The request
 * @returns The JSON, two spaces deep
 * @example
 * ```ts
 * JSON.parse(requestAsJson(request)).endpoint; // "api.users.list"
 * ```
 */
export function requestAsJson(r: RequestEntry): string {
  const endpoint = [r.source, r.group, r.method].filter(Boolean).join(".");
  return JSON.stringify(
    {
      id: r.id,
      endpoint,
      method: httpMethodOf(r),
      url: r.url,
      mode: r.mode,
      transport: r.transport ?? "http",
      status: r.status,
      statusCode: r.statusCode,
      startedAt: new Date(r.startedAt).toISOString(),
      timing: r.timing,
      variables: r.variables,
      response: r.data,
      error: r.error,
    },
    null,
    2,
  );
}
