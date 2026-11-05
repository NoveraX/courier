import type { WSCredentials } from "./ws-credentials";
import { encodeMessage, PROTOCOL_VERSION } from "./ws-protocol";

/**
 * The `auth` frame a socket proves who it is with. The first on a socket
 * names the version of the protocol it speaks, which a server of another
 * version refuses with 1002; one sent again on an admitted socket does not.
 *
 * @param id - The id the server answers it by
 * @param credentials - What the socket proves who it is with, if anything
 * @param opening - Whether it is the socket's first frame
 * @returns The encoded frame
 * @example
 * ```ts
 * authFrame("a1", { frame: { auth: { tenant: "acme" } } }, true);
 * // → '{"type":"auth","v":2,"id":"a1","payload":{"auth":{"tenant":"acme"}}}'
 * ```
 */
export function authFrame(
  id: string,
  credentials: WSCredentials | undefined,
  opening: boolean,
): string {
  const payload = credentials?.frame ?? {};
  return encodeMessage(
    opening ? { type: "auth", v: PROTOCOL_VERSION, id, payload } : { type: "auth", id, payload },
  );
}
