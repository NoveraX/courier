import type { AddressedRequest } from "../discover-app-origin";
import { peerAddressOf } from "./peer-address";
import { serverPortOf } from "./server-port";

/**
 * What can be told of a web request for the app's origin to be learned from
 * it: its own `Host`, and the port it was accepted on and the address it
 * came from, as far as the adapter recorded them — with
 * `rememberServerPort` and `rememberPeerAddress` — before asking.
 *
 * @param request - The request
 * @param serverPort - The port the server accepted it on, when the adapter knows it otherwise
 * @returns What `discoverAppOrigin` reads
 * @example
 * ```ts
 * announce(addressedOf(request));
 * ```
 */
export function addressedOf(request: Request, serverPort?: number): AddressedRequest {
  return {
    url: request.url,
    host: request.headers.get("host"),
    serverPort: serverPort ?? serverPortOf(request),
    peer: peerAddressOf(request),
  };
}
