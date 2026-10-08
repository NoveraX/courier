import { createInterface } from "node:readline";

import type { Connection } from "../protocol/connection";
import { ERROR_CODE, errorOf, type JsonRpcId } from "../protocol/json-rpc";
import type { McpServer } from "../protocol/mcp-server";
import { readMessage } from "../protocol/read-message";
import { type ClientQuestions, clientQuestions } from "./client-questions";

/** The two ends of a stdio connection: the lines the client writes, and where the server's go. */
export interface StdioStreams {
  readonly input: NodeJS.ReadableStream;
  /** Writes one line to the client: nothing else may reach that stream. */
  readonly write: (line: string) => void;
}

/**
 * Serve MCP over a stdio connection: one JSON-RPC message per line each way.
 *
 * Requests are answered as they finish, several at once. A request the
 * client cancels is dropped, and nothing is written for it. A client that
 * opened with `initialize` may be asked a question — the confirmation of a
 * destructive tool — and its answer comes back on the same stream.
 *
 * @param server - The protocol server
 * @param streams - The client's lines, and where the server's go
 * @returns Settles once the client closes its end, every call still running stopped
 * @example
 * ```ts
 * await serveStdio(server, { input: process.stdin, write: (line) => out.write(`${line}\n`) });
 * ```
 */
export async function serveStdio(server: McpServer, streams: StdioStreams): Promise<void> {
  const running = new Map<JsonRpcId, AbortController>();
  const questions: ClientQuestions = clientQuestions(streams.write);
  const connection: Connection = { transport: "stdio", ask: questions.ask };
  const send = (message: unknown) => streams.write(JSON.stringify(message));

  const lines = createInterface({ input: streams.input, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      send(errorOf(null, ERROR_CODE.parse, "Parse error: a line is one JSON-RPC message"));
      continue;
    }
    const incoming = readMessage(value);
    if (incoming.kind === "invalid") send(incoming.response);
    else if (incoming.kind === "response") questions.settle(incoming);
    else if (incoming.kind === "notification") cancelOn(incoming.message, running);
    else {
      const { message } = incoming;
      const controller = new AbortController();
      running.set(message.id, controller);
      void server.request(message, connection, controller.signal).then((response) => {
        running.delete(message.id);
        if (response !== undefined && !controller.signal.aborted) send(response);
      });
    }
  }
  for (const controller of running.values())
    controller.abort(new Error("The client closed the connection"));
  questions.close();
}

/* `notifications/cancelled` stops the request it names; every other notification needs nothing. */
function cancelOn(
  message: { method: string; params: Record<string, unknown> },
  running: Map<JsonRpcId, AbortController>,
): void {
  if (message.method !== "notifications/cancelled") return;
  const id = message.params.requestId;
  if (typeof id !== "string" && typeof id !== "number") return;
  running
    .get(id)
    ?.abort(
      new Error(
        typeof message.params.reason === "string"
          ? message.params.reason
          : "Cancelled by the client",
      ),
    );
}
