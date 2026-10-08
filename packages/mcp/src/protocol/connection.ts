import type { AgentClient } from "@noverax/courier";

import type { LegacyVersion } from "./versions";

/** What `initialize` settled for a client that opened with it. */
export interface LegacySession {
  readonly version: LegacyVersion;
  readonly capabilities: Record<string, unknown>;
  readonly client?: AgentClient | undefined;
}

/**
 * What a request arrived over: a stdio connection, which keeps what
 * `initialize` settled and can put a question to its client, or one HTTP
 * request, which carries everything it relies on itself.
 */
export interface Connection {
  readonly transport: "stdio" | "http";
  /** What `initialize` settled, on a stdio connection opened with it. */
  legacy?: LegacySession | undefined;
  /** The revision an HTTP request names in its `MCP-Protocol-Version` header. */
  readonly headerVersion?: string | undefined;
  /** Who the HTTP handler's `authorize` let in. */
  readonly principal?: unknown;
  /**
   * Put a request to the client and wait for its answer: over stdio, to a
   * client that opened with `initialize`, which takes requests from its server.
   */
  readonly ask?:
    | ((method: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>)
    | undefined;
}
