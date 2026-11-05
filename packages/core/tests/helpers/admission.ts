/** What a test server pings a connection by: seldom enough that no test waits it out unless it means to. */
export const TEST_HEARTBEAT = { intervalMs: 100_000, timeoutMs: 50_000 } as const;

/** What a server answers a connection with, besides the `auth` it answers. */
export interface AdmissionOptions {
  readonly heartbeat?: { readonly intervalMs: number; readonly timeoutMs: number };
  readonly maxMessageSize?: number;
  readonly connectionId?: string;
}

/**
 * The `auth_ok` a server admits a connection with, or takes its credentials
 * sent again with: the answer to the last `auth` frame the client sent.
 *
 * @param sent - The frames the client sent on the socket, encoded
 * @param options - The server's heartbeat, its message limit and the connection's id
 * @returns The encoded frame
 * @throws {Error} When the client sent no `auth` frame to answer
 * @example
 * ```ts
 * socket.receive(admission(socket.sent));
 * ```
 */
export function admission(sent: readonly string[], options: AdmissionOptions = {}): string {
  const auth = sent
    .map((frame) => JSON.parse(frame) as { type?: unknown; id?: unknown })
    .findLast((frame) => frame.type === "auth");
  if (auth === undefined) throw new Error("The client sent no auth frame to answer");
  return JSON.stringify({
    type: "auth_ok",
    id: auth.id,
    v: 2,
    connectionId: options.connectionId ?? "c1",
    heartbeat: options.heartbeat ?? TEST_HEARTBEAT,
    limits: { maxMessageSize: options.maxMessageSize ?? 65_536, maxSubscriptions: 100 },
  });
}
