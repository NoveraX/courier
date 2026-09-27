import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createHandler } from "../../src/adapter";
import { sendWebResponse, toWebRequest } from "../../src/node";

export interface ProxyServer {
  /** Absolute URL of the proxy route, for `proxyPath.http`. */
  url: string;
  close(): Promise<void>;
}

/**
 * The proxy route served over real HTTP, as a Node app mounts it.
 *
 * The sources it resolves are whatever the test registered; nothing is
 * stubbed between the browser client, the proxy and the upstream.
 */
export async function startProxyServer(): Promise<ProxyServer> {
  const handler = createHandler();
  const server: Server = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/request`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
