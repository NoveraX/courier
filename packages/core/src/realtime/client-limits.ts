/**
 * What a realtime client — a WebSocket connection, an SSE subscription —
 * waits for, and how long. Kept apart from the server's `LIMITS`, which
 * every page that calls an API loads: these load with the client, which a
 * page loads when it first opens a stream.
 */
export const CLIENT_LIMITS = {
  /**
   * How long a socket may take to open, its credentials asked for included,
   * and a channel's socket options to be found — whose session it opens
   * with, on a server (15 s)
   */
  WS_CONNECT_TIMEOUT_MS: 15_000,

  /** How long a server may take to admit a connection, or to take credentials sent again (15 s) */
  WS_AUTH_TIMEOUT_MS: 15_000,

  /** How long an open socket checked on a resume signal may take to answer its ping (5 s) */
  WS_RESUME_PROBE_TIMEOUT_MS: 5_000,

  /** How long a connection must stay open for its next drop to start the backoff over (10 s) */
  RECONNECT_STABLE_MS: 10_000,

  /** Longest wait a server can ask a reconnecting client for (5 minutes) */
  RECONNECT_MAX_HINT_MS: 300_000,

  /** Resume signals this close together are told once (1 s) */
  RESUME_DEBOUNCE_MS: 1_000,

  /** Longest random wait before reconnecting on `online`, so clients one outage dropped do not return together (1 s) */
  RESUME_ONLINE_SPREAD_MS: 1_000,

  /**
   * How long a stream may hear nothing from its server — no event, no
   * comment — before it is opened again, unless the subscription says
   * otherwise: a Courier server comments every 25 s (45 s)
   */
  SSE_SILENCE_TIMEOUT_MS: 45_000,

  /**
   * How long a stream may take to open, as a socket may: what
   * `beforeConnect` gives it, its request, and the server's answer, a
   * refusal's body included (15 s)
   */
  SSE_CONNECT_TIMEOUT_MS: 15_000,

  /** Most of a refusal's body a stream reads for what the server said: a Courier server's is far shorter (64 KiB) */
  SSE_REFUSAL_MAX_BYTES: 65_536,
} as const;
