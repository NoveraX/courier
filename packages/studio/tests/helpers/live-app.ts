import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHandler, registerSources } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { attachRuntime, type RuntimeHandle } from "@noverax/courier-studio-core/runtime";

/** An application serving the proxy for its sources, attached to Studio. */
export interface LiveApp {
  /** Where the proxy answers, as a caller's `proxyPath.http`. */
  proxyUrl: string;
  /** The runtime's handle. */
  runtime: RuntimeHandle;
  /** Detach and stop serving. */
  close(): Promise<void>;
}

/**
 * Register `sources`, serve the proxy for them on a free port, and attach this
 * process to the Studio at `studioUrl` under `runtimeId`.
 *
 * @param studioUrl - Where Studio listens
 * @param runtimeId - The runtime's id
 * @param sources - The sources to register
 * @returns The running application
 */
export async function startLiveApp(
  studioUrl: string,
  runtimeId: string,
  sources: Sources,
): Promise<LiveApp> {
  registerSources(sources);
  const { handle } = createHandler();
  const server: Server = createServer((req, res) => {
    void handle(toWebRequest(req)).then((answer) => sendWebResponse(answer, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.COURIER_STUDIO_URL = studioUrl;
  const runtime = await attachRuntime(runtimeId);
  const { port } = server.address() as AddressInfo;
  return {
    proxyUrl: `http://127.0.0.1:${port}/api/request`,
    runtime,
    async close() {
      runtime.detach();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** How the upstream answers one route. */
export interface UpstreamRoute {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** How long it waits before answering. */
  delayMs?: number;
}

/** An upstream answering each `METHOD /path` as its route says, and 404 otherwise. */
export async function startUpstream(
  routes: Record<string, UpstreamRoute>,
): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const route = routes[`${req.method} ${req.url}`];
    setTimeout(() => {
      if (res.destroyed) return;
      res.writeHead(route?.status ?? 404, {
        "content-type": "application/json",
        ...route?.headers,
      });
      res.end(JSON.stringify(route?.body ?? { message: "no such route" }));
    }, route?.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
