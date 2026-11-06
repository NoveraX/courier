import { createLogger } from "../../logger";
import { fingerprintOf } from "../credentials-fingerprint";
import { ConnectionError } from "../errors";
import type { MachineEvent } from "./connection-machine-types";
import type { WSCredentials } from "./ws-credentials";

const log = createLogger("WS");

/**
 * What credentials that came tell the connection: their fingerprint, or —
 * for ones no frame can carry, a `ws.auth` holding a BigInt or an object
 * that points back at itself — that its socket cannot be made with them.
 * No attempt could send them, so the connection ends with why, as one whose
 * socket the platform refuses does, and nothing is left unhandled.
 *
 * @param found - The credentials an attempt asked for
 * @returns The event to tell the connection's machine
 * @example
 * ```ts
 * dispatch(credentialsEvent({ frame: { auth: { tenant: "acme" } } }));
 * ```
 */
export function credentialsEvent(found: WSCredentials | undefined): MachineEvent {
  try {
    return { type: "credentials", fingerprint: fingerprintOf(found) };
  } catch (error) {
    log.error("The socket's credentials hold what JSON cannot carry: it does not connect", error);
    const reason = error instanceof Error ? error.message : String(error);
    return {
      type: "socket-failed",
      error: new ConnectionError(`The socket's credentials cannot be sent: ${reason}`),
    };
  }
}
