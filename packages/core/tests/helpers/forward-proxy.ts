import { createServer, request as httpRequest, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";

/** A forward proxy a test runs, and what it was asked for. */
export interface ForwardProxy {
  /** `http://127.0.0.1:<port>` */
  url: string;
  /**
   * What it was asked, in order: `CONNECT host:port` for a tunnel, `GET
   * http://host/path` for a plain request, each marked ` (auth)` when it
   * carried `Proxy-Authorization`.
   */
  seen: string[];
  close(): Promise<void>;
}

/** What the proxy does besides passing requests on. */
export interface ForwardProxyOptions {
  /** Refuse every request with this status, as a proxy that wants credentials answers 407 */
  refuse?: number | undefined;
  /** Where a host asked for is reached, as a proxy resolves names this machine cannot */
  reach?: ((host: string, port: number) => { host: string; port: number }) | undefined;
}

/**
 * Start an HTTP forward proxy on a free port: it opens a tunnel for
 * `CONNECT` and passes a plain request on, as a corporate proxy does, and
 * remembers each. Names are reached as `reach` says, `localhost` as
 * `127.0.0.1` otherwise.
 *
 * @param options - A status to refuse every request with, and where hosts are reached
 * @returns The running proxy
 * @example
 * ```ts
 * const proxy = await startForwardProxy();
 * await fetch(url, { dispatcher: new ProxyAgent(proxy.url) });
 * expect(proxy.seen).toEqual([`CONNECT localhost:${port}`]);
 * ```
 */
export async function startForwardProxy(options: ForwardProxyOptions = {}): Promise<ForwardProxy> {
  const seen: string[] = [];
  const sockets = new Set<Socket>();
  const reach =
    options.reach ?? ((host, port) => ({ host: host === "localhost" ? "127.0.0.1" : host, port }));
  const server: Server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}${req.headers["proxy-authorization"] ? " (auth)" : ""}`);
    if (options.refuse !== undefined) return void res.writeHead(options.refuse).end();
    const target = new URL(req.url ?? "");
    const to = reach(target.hostname, Number(target.port) || 80);
    const headers = { ...req.headers };
    delete headers["proxy-authorization"];
    const onward = httpRequest(
      {
        host: to.host,
        port: to.port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
        /* Its own connection: a test may have turned Node's proxy on for the global agent. */
        agent: false,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    onward.on("error", () => res.writeHead(502).end());
    req.pipe(onward);
  });
  server.on("connect", (req, client: Socket, head: Buffer) => {
    seen.push(`CONNECT ${req.url}${req.headers["proxy-authorization"] ? " (auth)" : ""}`);
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => client.destroy());
    if (options.refuse !== undefined)
      return void client.end(`HTTP/1.1 ${options.refuse} Refused\r\n\r\n`);
    const [host = "", port = "443"] = (req.url ?? "").split(/:(?=\d+$)/);
    const to = reach(host, Number(port));
    const upstream = connect(to.port, to.host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on("close", () => sockets.delete(upstream));
    upstream.on("error", () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
