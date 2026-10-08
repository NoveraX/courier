import { createInterface } from "node:readline";

/** What the bridge carries between: the client's lines, where the answers go, and Studio. */
export interface BridgeEnds {
  readonly input: NodeJS.ReadableStream;
  /** Writes one line to the client: nothing else may reach that stream. */
  readonly write: (line: string) => void;
  /** Studio's MCP endpoint: `http://localhost:6280/mcp`. */
  readonly url: string;
  readonly token: string;
  readonly fetch?: typeof fetch | undefined;
}

const PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";

/**
 * Carry an editor's MCP connection over stdio to Studio's HTTP endpoint:
 * each line the client writes goes to Studio as a request of its own, with
 * Studio's token and the headers the protocol asks of HTTP, and Studio's
 * answer comes back as a line. A client that opens with `initialize` names
 * the revision it settled on in every request after it; one on 2026-07-28
 * names it in each request already.
 *
 * @param ends - The client's lines, where the answers go, and Studio
 * @returns Settles once the client closes its end
 * @example
 * ```ts
 * await bridgeToStudio({ input: process.stdin, write, url: "http://localhost:6280/mcp", token });
 * ```
 */
export async function bridgeToStudio(ends: BridgeEnds): Promise<void> {
  const send = ends.fetch ?? fetch;
  let settled: string | undefined;
  const pending: Promise<void>[] = [];
  for await (const line of createInterface({
    input: ends.input,
    crlfDelay: Number.POSITIVE_INFINITY,
  })) {
    if (line.trim() === "") continue;
    const message = parsed(line);
    pending.push(
      forward(message, line).then((answer) => {
        if (answer !== undefined) ends.write(answer);
      }),
    );
  }
  await Promise.all(pending);

  async function forward(
    message: Record<string, unknown> | undefined,
    body: string,
  ): Promise<string | undefined> {
    const headers = headersFor(message, settled, ends.token);
    try {
      const response = await send(ends.url, { method: "POST", headers, body });
      if (response.status === 202 || response.status === 204) return undefined;
      const text = await response.text();
      if (message?.method === "initialize") settled = versionIn(text) ?? settled;
      return text.replace(/\n/g, "");
    } catch (error) {
      if (message?.id === undefined) return undefined;
      const reason = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: `Studio could not be reached at ${ends.url} (${reason}): start it with npx courier-studio`,
        },
      });
    }
  }
}

function headersFor(
  message: Record<string, unknown> | undefined,
  settled: string | undefined,
  token: string,
): Record<string, string> {
  const params = isRecord(message?.params) ? message.params : {};
  const meta = isRecord(params._meta) ? params._meta : {};
  const version = typeof meta[PROTOCOL_VERSION] === "string" ? meta[PROTOCOL_VERSION] : settled;
  const name =
    typeof params.name === "string"
      ? params.name
      : typeof params.uri === "string"
        ? params.uri
        : undefined;
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
    ...(version !== undefined && { "mcp-protocol-version": version }),
    ...(typeof message?.method === "string" && { "mcp-method": message.method }),
    ...(name !== undefined && { "mcp-name": headerSafe(name) }),
  };
}

/* A name outside plain ASCII travels as the protocol's base64 form. */
function headerSafe(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) && value.trim() === value
    ? value
    : `=?base64?${Buffer.from(value).toString("base64")}?=`;
}

function versionIn(text: string): string | undefined {
  const answer = parsed(text);
  const result = isRecord(answer?.result) ? answer.result : undefined;
  return typeof result?.protocolVersion === "string" ? result.protocolVersion : undefined;
}

/* A line that is no JSON goes to Studio as it came, which answers it with the protocol's parse error. */
function parsed(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
