/**
 * The courier proxy route served over real HTTP, as a Node app mounts it,
 * answering for the sources a test hands it.
 */
import { createServer } from "node:http";
import { createHandler } from "@noverax/courier";
import type { AnySource } from "@noverax/courier/define";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";

/** What `defineApi` returns: an object carrying its options. */
function isSource(value: unknown): value is AnySource {
  if (typeof value !== "object" || value === null || !("options" in value)) return false;
  return typeof value.options === "object" && value.options !== null;
}

/** A running proxy. */
export interface ProxyServer {
  /** Absolute URL of the proxy route, for `proxyPath.http`. */
  url: string;
  close: () => Promise<void>;
}

/**
 * Start the proxy on a free port of the loopback interface.
 *
 * @param loaded - The sources it answers for, as a loaded module exports them
 * @returns The running proxy
 */
export async function startProxyServer(loaded: Record<string, unknown>): Promise<ProxyServer> {
  const sources: Record<string, AnySource> = {};
  for (const [name, value] of Object.entries(loaded)) {
    if (!isSource(value)) throw new Error(`${name} is not a source`);
    sources[name] = value;
  }
  const handler = createHandler({ sources });
  const server = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the proxy has no port");
  return {
    url: `http://127.0.0.1:${address.port}/api/request`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
