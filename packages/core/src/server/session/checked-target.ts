import type { SessionTarget } from "../../session/session-target";
import { fieldOf } from "../../transport/direct/read-definition";
import { heldForCall } from "../assert-server-options";

/**
 * A call as a server lends it the session: what the server holds of the
 * options the call read — checked first where it holds nothing of them —
 * rather than anything the call read of them itself, and how its endpoint
 * takes the session as the endpoint's own options say, never a prototype.
 * The server asks this as the call asks for its session, before the call
 * reads anything of what it takes: the request's headers it forwards, and
 * those its answer hands on, are then read where the server holds them.
 *
 * @param target - The call, as the session reads it
 * @returns The call, carrying what the server holds
 * @throws ConfigurationError what `assertServerOptions` refuses options with
 * @example
 * ```ts
 * const call = checkedTarget(target);
 * ```
 */
export function checkedTarget(target: SessionTarget): SessionTarget {
  const held = heldForCall(target);
  if (held === undefined) return target;
  const how = fieldOf(target.endpoint, "session");
  const session = how === false ? undefined : held.session;
  const forward = fieldOf(target.endpoint, "forward") === false ? undefined : held.forward;
  const unguarded = how === "unguarded";
  const same =
    session === target.session && forward === target.forward && unguarded === target.unguarded;
  return same ? target : { ...target, session, forward, unguarded };
}
