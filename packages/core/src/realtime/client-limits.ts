/**
 * What a realtime client — a WebSocket connection, an SSE subscription —
 * waits for, and how long. Kept apart from the server's `LIMITS`, which
 * every page that calls an API loads: these load with the client, which a
 * page loads when it first opens a stream.
 */
export const CLIENT_LIMITS = {
  /** How long a socket may take to open, its credentials asked for included (15 s) */
  WS_CONNECT_TIMEOUT_MS: 15_000,

  /** How long a server may take to admit a connection, or to take credentials sent again (15 s) */
  WS_AUTH_TIMEOUT_MS: 15_000,

  /** How long an open socket checked on a resume signal may take to answer its ping (5 s) */
  WS_RESUME_PROBE_TIMEOUT_MS: 5_000,

  /** The server's ping interval a client counts on until its server says otherwise (25 s) */
  WS_HEARTBEAT_INTERVAL_MS: 25_000,

  /** How late past its interval a ping may come before the client takes the server for gone (10 s) */
  WS_HEARTBEAT_TIMEOUT_MS: 10_000,

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
} as const;
