import { type AddressedRequest, addressedOf } from "@noverax/courier/internal";

/**
 * What a Next.js route can tell of its request for the app's origin to be
 * learned from it: its own `Host`, and the port Next serves on — Next gives
 * every request a URL on `localhost` and its own port, whatever `Host` it
 * came with, so that port is the server's. Next tells no peer address.
 *
 * @param request - The request as Next hands it to the route
 * @returns What `discoverAppOrigin` reads
 * @example
 * ```ts
 * announce(nextAddressed(request));
 * ```
 */
export function nextAddressed(request: Request): AddressedRequest {
  const url = new URL(request.url);
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  return addressedOf(request, port);
}
