/**
 * A stdio connection inside one process: the server reads the lines a
 * client transport writes, and the client reads the server's, so an
 * official SDK client talks to `serveStdio` exactly as over a pipe.
 */

import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";

import type { McpServer } from "../../src/protocol/mcp-server";
import { serveStdio } from "../../src/transport/serve-stdio";

/** The SDK's transport contract, as both SDK generations define it. */
export interface PipeTransport {
  start(): Promise<void>;
  send(message: unknown): Promise<void>;
  close(): Promise<void>;
  onmessage?: ((message: never) => void) | undefined;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
}

export interface StdioPair {
  /** Give it to the SDK client's `connect`. */
  readonly transport: PipeTransport;
  /** Every line the server wrote, as it wrote it. */
  readonly written: string[];
  /** Every message the client sent. */
  readonly sent: unknown[];
  /** Settles once the server has seen the client close its end. */
  readonly served: Promise<void>;
}

export function stdioPair(server: McpServer): StdioPair {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const written: string[] = [];
  const sent: unknown[] = [];
  const served = serveStdio(server, {
    input: toServer,
    write: (line) => {
      written.push(line);
      fromServer.write(`${line}\n`);
    },
  });
  const transport: PipeTransport = {
    async start() {
      const lines = createInterface({ input: fromServer });
      lines.on("line", (line) => transport.onmessage?.(JSON.parse(line) as never));
    },
    async send(message) {
      sent.push(message);
      toServer.write(`${JSON.stringify(message)}\n`);
    },
    async close() {
      toServer.end();
      fromServer.end();
      transport.onclose?.();
    },
  };
  return { transport, written, sent, served };
}
