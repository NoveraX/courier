import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHandler, createWSHandler, type ProxyPath, registerSources } from "@noverax/courier";
import { clearWSConnectionPool } from "@noverax/courier/internal-streams";
import {
  attachWebSocketUpgrade,
  sendWebResponse,
  toWebRequest,
  type UpgradeServer,
} from "@noverax/courier/node";
import { WebSocketServer } from "ws";

/** The origin jsdom gives the test page, which a proxy must accept. */
const PAGE_ORIGIN = "http://localhost:3000";

/** A running Courier proxy and the paths a proxy caller reaches it by. */
export interface CourierServer {
  proxyPath: Required<ProxyPath>;
  close: () => Promise<void>;
}

/**
 * Serve `sources` through Courier's own proxy handlers on a free port:
 * requests and SSE streams over HTTP, channels over a real WebSocket.
 *
 * @param sources - Named API definitions, as `registerSources` takes them
 * @returns Absolute proxy paths for every transport, and a way to stop
 * @example
 * const server = await startCourierServer({ api });
 * const q = createProxyQueryCaller<typeof api>("api", { source: api, proxyPath: server.proxyPath });
 */
export async function startCourierServer(
  sources: Parameters<typeof registerSources>[0],
): Promise<CourierServer> {
  registerSources(sources);
  const http = createHandler({ allowedOrigins: [PAGE_ORIGIN] });
  const ws = createWSHandler({ allowedOrigins: [PAGE_ORIGIN] });
  const server = createServer(async (request, response) => {
    await sendWebResponse(await http.handle(toWebRequest(request, response)), response);
  });
  attachWebSocketUpgrade(server, {
    path: "/api/ws",
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => ws.handleSocket(socket, request),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    proxyPath: {
      http: `http://127.0.0.1:${port}/api/request`,
      sse: `http://127.0.0.1:${port}/api/sse`,
      ws: `ws://127.0.0.1:${port}/api/ws`,
    },
    close: async () => {
      clearWSConnectionPool();
      await http.shutdownSSE({ drainMs: 0 });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
