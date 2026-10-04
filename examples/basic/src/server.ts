import { type CourierServer, createCourierServer } from "@noverax/courier-server";

import { sources } from "./api";

/**
 * The application's own server: Courier's proxy in front of the upstream.
 * A browser reaches the upstream only through it, and only at the endpoints
 * the boundary names.
 *
 * @param port - Where it listens, on 127.0.0.1
 * @returns The listening server
 */
export function startProxy(port = 3001): Promise<CourierServer> {
  return new Promise((resolve) => {
    const server = createCourierServer({
      sources,
      port,
      host: "127.0.0.1",
      onReady: () => resolve(server),
    });
  });
}
