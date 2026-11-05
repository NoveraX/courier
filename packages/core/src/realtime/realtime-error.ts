/**
 * The realtime errors a page may need before its realtime client has loaded:
 * the base every realtime error extends, and a connection's. Kept apart from
 * the rest of `./errors`, which loads with the client, so a page that opens
 * no stream carries no other error class.
 */

import { CourierError } from "../errors";

/** Base error for all realtime transport errors */
export class RealtimeError extends CourierError<number> {
  constructor(code: number, message: string) {
    super(message, { code });
    this.name = "RealtimeError";
  }
}

/** Connection-level error (upgrade failed, network loss) */
export class ConnectionError extends RealtimeError {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    /* 1006: the socket closed with no close frame (RFC 6455). A number here,
       as a page's first chunk carries this module and not the protocol's table. */
    super(statusCode ?? 1006, message);
    this.name = "ConnectionError";
  }
}
