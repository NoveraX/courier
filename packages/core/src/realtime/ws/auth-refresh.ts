import type { ScopedLogger } from "../../logger";
import type { WSConnectionConfig } from "./ws-types";

/** What answering the server's request for fresh credentials needs. */
export interface AuthRefreshContext {
  config: Pick<WSConnectionConfig, "credentials">;
  log: ScopedLogger;
  /** Send the socket's credentials again, asked for anew */
  authenticate(): void;
}

/**
 * Answer the server's `auth_required` with the socket's credentials, asked
 * for anew and sent on the open socket without reconnecting. A connection
 * with none to send leaves it unanswered, and the server closes it at its
 * deadline.
 *
 * @param ctx - The connection's credentials and how it sends them
 *
 * @example
 * answerAuthRequired({ config, log, authenticate });
 */
export function answerAuthRequired(ctx: AuthRefreshContext): void {
  if (ctx.config.credentials === undefined) {
    ctx.log.warn("The server asked for credentials, and this connection has none to send");
    return;
  }
  ctx.authenticate();
}
