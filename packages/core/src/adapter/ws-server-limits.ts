/**
 * Limits of a WebSocket handler only the server keeps: apart from
 * `LIMITS`, which a page's client imports too, so none of them is carried
 * into a page.
 */
export const WS_SERVER_LIMITS = {
  /** How long a handler's destroy() waits for its connections to close (5 s) */
  SHUTDOWN_TIMEOUT_MS: 5_000,
  /** The span a stopping handler spreads its clients' reconnects over, so they do not come back at once (5 s) */
  SHUTDOWN_RECONNECT_SPREAD_MS: 5_000,
  /** How long a client refused for a limit on connections — its address's, its key's — waits to try again, as a place may free meanwhile (10 s) */
  LIMIT_RETRY_AFTER_MS: 10_000,
  /** How long a lease store has to decide a connection's place before the replica decides alone */
  LEASE_TIMEOUT_MS: 2_000,
  /** How often a replica renews the leases it holds — a third of the 60 s a shared store keeps them */
  LEASE_RENEW_MS: 20_000,
  /** How long a topic log has to say where a topic stands, or send back its events, before a replica goes on without */
  LOG_TIMEOUT_MS: 2_000,
  /** Live frames of a topic held for a subscription while it resumes from the log; one more, and it resumes nothing */
  RESUME_HELD_FRAMES: 1_000,
  /** Events of a topic held while a replica reads the ones it missed from the log; the rest are read later too */
  LOG_WAITING_EVENTS: 1_000,
} as const;
