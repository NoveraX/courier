import { createInterface } from "node:readline";
import { META } from "@noverax/courier-mcp/internal";

import { type BridgedClient, callConfirming, confirmsThroughBridge } from "./bridge-confirmation";
import { createClientAsks } from "./client-asks";

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

type Message = Record<string, unknown>;

/**
 * Carry an editor's MCP connection over stdio to Studio's HTTP endpoint:
 * each line the client writes goes to Studio as a request of its own, with
 * Studio's token and the headers the protocol asks of HTTP, and Studio's
 * answer comes back as a line. A client that opens with `initialize` names
 * the revision it settled on in every request after it; one on 2026-07-28
 * names it in each request already.
 *
 * A write a person confirms is asked about over the client's connection: a
 * client on the 2025 handshake that can ask its person has its tool calls
 * made as 2026-07-28 makes them, and the bridge puts Studio's question to
 * it (see `callConfirming`).
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
  const client: BridgedClient = {};
  const asks = createClientAsks(ends.write);
  const pending: Promise<void>[] = [];
  for await (const line of createInterface({
    input: ends.input,
    crlfDelay: Number.POSITIVE_INFINITY,
  })) {
    if (line.trim() === "") continue;
    const message = parsed(line);
    if (message !== undefined && asks.answered(message)) continue;
    if (message?.method === "initialize") remember(client, message);
    pending.push(
      answerTo(message, line).then((answer) => {
        if (answer !== undefined) ends.write(answer);
      }),
    );
  }
  asks.close();
  await Promise.all(pending);

  async function answerTo(message: Message | undefined, line: string): Promise<string | undefined> {
    if (message === undefined || !confirmsThroughBridge(message, client)) {
      return forward(message, line);
    }
    const post = async (body: Message) => {
      const text = await forward(body, JSON.stringify(body));
      return text === undefined ? undefined : parsed(text);
    };
    const answer = await callConfirming(message, client, asks, post);
    return answer === undefined ? undefined : JSON.stringify(answer);
  }

  async function forward(message: Message | undefined, body: string): Promise<string | undefined> {
    const headers = headersFor(message, client.version, ends.token);
    try {
      const response = await send(ends.url, { method: "POST", headers, body });
      if (response.status === 202 || response.status === 204) return undefined;
      const text = await response.text();
      if (message?.method === "initialize") client.version = versionIn(text) ?? client.version;
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

/* What the client says of itself as it opens: what it can do, and its name. */
function remember(client: BridgedClient, message: Message): void {
  const params = isRecord(message.params) ? message.params : {};
  if (isRecord(params.capabilities)) client.capabilities = params.capabilities;
  if (isRecord(params.clientInfo)) client.info = params.clientInfo;
}

function headersFor(
  message: Record<string, unknown> | undefined,
  settled: string | undefined,
  token: string,
): Record<string, string> {
  const params = isRecord(message?.params) ? message.params : {};
  const meta = isRecord(params._meta) ? params._meta : {};
  const named = meta[META.protocolVersion];
  const version = typeof named === "string" ? named : settled;
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
