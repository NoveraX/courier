import { once } from "node:events"
import { createServer, type Server } from "node:http"

import type { Express } from "express"

import { VISITOR_ADDRESS_HEADER } from "../../server/visitor-address"

/** The examples' backend, served on a port of its own for a test. */
export interface Served {
  url: string
  close(): Promise<void>
}

/**
 * Serve an application on a port the system picks, at the address it
 * reports. With `as`, each call that names no visitor's address names that
 * one, as the site's server names every visitor's: for a test of what the
 * backend does with a call, not of whom it counts it as.
 *
 * @param app - The application
 * @param as - The visitor's address a call that names none is made from
 * @returns Where it is served, and how to stop it
 * @example
 * ```ts
 * const backend = await serve(createDemoApp(), { as: "198.51.100.1" })
 * await fetch(`${backend.url}/users`)
 * ```
 */
export async function serve(app: Express, { as }: { as?: string } = {}): Promise<Served> {
  const server: Server = createServer((req, res) => {
    if (as !== undefined) req.headers[VISITOR_ADDRESS_HEADER] ??= as
    app(req, res)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
