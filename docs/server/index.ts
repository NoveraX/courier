import { createServer } from "node:http"

import { createDemoApp } from "./app"
import { DEMO_LIMITS } from "./limits"

/* The site's image keeps the backend to its container — EXPRESS_HOST=127.0.0.1 — since only the
   site's server calls it; port 0 takes one the system picks, which the line below names. */
const port = Number(process.env.EXPRESS_PORT ?? 4000)
const host = process.env.EXPRESS_HOST

const server = createServer(
  { requestTimeout: DEMO_LIMITS.requestMs, headersTimeout: DEMO_LIMITS.headersMs },
  createDemoApp()
)

server.once("listening", () => {
  const listened = server.address()
  if (listened === null || typeof listened === "string") return
  const named = listened.address.includes(":") ? `[${listened.address}]` : listened.address
  console.log(`The examples' backend listens on http://${named}:${listened.port}`)
})
server.listen({ port, host })

/* Asked to stop, as a container is: take no new call, let the answers on their way finish, and cut
   off what is left once the time is up. The process ends when its last connection does. */
function stop(): void {
  server.close()
  server.closeIdleConnections()
  setTimeout(() => server.closeAllConnections(), DEMO_LIMITS.shutdownMs).unref()
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, stop)
