import type { ScopedLogger } from "../../logger";
import type { ConnectionState } from "../connection-state";
import type { WSConnectionConfig } from "./ws-types";

/** What answering the server's request for a fresh token needs. */
export interface AuthRefreshContext {
  config: Pick<WSConnectionConfig, "getAuthToken">;
  state: ConnectionState;
  log: ScopedLogger;
  refreshToken(token: string): void;
}

/**
 * Answer the server's `auth_required` with a fresh token from
 * `getAuthToken`, sent on the open socket without reconnecting.
 *
 * @param ctx - The connection's token source, state, log and token sender
 *
 * @example
 * answerAuthRequired({ config, state, log, refreshToken });
 */
export function answerAuthRequired(ctx: AuthRefreshContext): void {
  const fetcher = ctx.config.getAuthToken;
  if (!fetcher) {
    ctx.log.warn("Server requested auth but no getAuthToken configured");
    return;
  }
  void (async () => {
    try {
      const token = await fetcher();
      if (ctx.state.current === "connected") ctx.refreshToken(token);
    } catch (err) {
      ctx.log.warn("Failed to get auth token for refresh", err);
    }
  })();
}
