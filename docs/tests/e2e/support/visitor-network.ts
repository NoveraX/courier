import { readFileSync } from "node:fs"
import {
  createServer as createHttpServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http"
import { createServer as createHttpsServer } from "node:https"
import { connect, type Socket } from "node:net"

import { chainHeaders, type Route } from "./deployment-chain"

/** How one visitor's browser reaches the site: through the proxy its context is set to. */
export interface VisitorNetwork {
  /** The proxy server the browser's context is given. */
  readonly proxy: string
  close(): Promise<void>
}

/** What the network stands in front of, under which name, and for whom. */
export interface VisitorNetworkOptions {
  /** Where the site's own server listens. */
  readonly site: URL
  /** The name the browser asks for, over HTTPS. */
  readonly host: string
  /** The address the visitor comes from. */
  readonly address: string
  /** Whether the visitor comes through the DDoS filter, as visitors do, or around it. */
  readonly route?: Route | undefined
  readonly keyPath: string
  readonly certPath: string
}

/* Headers that belong to one connection, which a proxy does not pass on. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "upgrade",
])

function passedOn(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name)))
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      resolve(typeof address === "object" && address !== null ? address.port : 0)
    })
  })
}

/* The front: TLS for the site's name, then each request to the site's server over plain HTTP, its
   headers as the DDoS filter and Traefik before the container write them (deployment-chain.ts). */
function frontFor(options: VisitorNetworkOptions) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const upstream = request(
      {
        hostname: options.site.hostname,
        port: options.site.port,
        method: req.method,
        path: req.url,
        headers: chainHeaders(passedOn(req.headers), options.route ?? "filter", options.address),
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, passedOn(answer.headers))
        answer.pipe(res)
      }
    )
    upstream.once("error", () => res.destroy())
    res.once("close", () => upstream.destroy())
    req.pipe(upstream)
  }
}

/**
 * Open the network one visitor reaches the site through: a TLS front on
 * the site's name, before the site's own server as the DDoS filter and
 * Traefik stand in production, and a proxy that tunnels the browser's
 * connections to that name — and to no other — to the front. A browser
 * given the proxy opens `https://<host>` as the site, an origin that is
 * neither localhost nor plain HTTP, and the site is told of the visitor as
 * the production chain tells it: through the filter, or around it.
 *
 * @param options - The site, its name, the visitor's address, and the front's key and certificate
 * @returns The network
 * @example
 * ```ts
 * const network = await openVisitorNetwork({ site, host: "courier.test", address: "198.51.100.7", keyPath, certPath })
 * const context = await browser.newContext({ proxy: { server: network.proxy }, ignoreHTTPSErrors: true })
 * ```
 */
export async function openVisitorNetwork(options: VisitorNetworkOptions): Promise<VisitorNetwork> {
  const front = createHttpsServer(
    { key: readFileSync(options.keyPath), cert: readFileSync(options.certPath) },
    frontFor(options)
  )
  const frontPort = await listen(front)
  const tunnels = new Set<Socket>()
  const proxy = createHttpServer((_req, res) => res.writeHead(405).end())
  proxy.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
    if (req.url !== `${options.host}:443`) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n")
      return
    }
    const upstream = connect(frontPort, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    for (const socket of [client, upstream]) {
      tunnels.add(socket)
      socket.once("close", () => tunnels.delete(socket))
      socket.once("error", () => {
        client.destroy()
        upstream.destroy()
      })
    }
  })
  const proxyPort = await listen(proxy)

  const close = async () => {
    for (const socket of tunnels) socket.destroy()
    for (const server of [proxy, front]) server.closeAllConnections()
    await Promise.all(
      [proxy, front].map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    )
  }
  return { proxy: `http://127.0.0.1:${proxyPort}`, close }
}
