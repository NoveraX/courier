import { once } from "node:events"
import type { Server } from "node:http"

import type { Express } from "express"

/** The examples' backend, served on a port of its own for a test. */
export interface Served {
  url: string
  close(): Promise<void>
}

/**
 * Serve an application on a port the system picks, at the address it reports.
 *
 * @param app - The application
 * @returns Where it is served, and how to stop it
 * @example
 * ```ts
 * const backend = await serve(createDemoApp())
 * await fetch(`${backend.url}/users`)
 * ```
 */
export async function serve(app: Express): Promise<Served> {
  const server: Server = app.listen(0, "127.0.0.1")
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
