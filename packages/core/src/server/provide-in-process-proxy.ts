import { type AdapterHandler, createHandler } from "../adapter/create-handler";
import type { InProcessProxyCapability } from "../capabilities/in-process-proxy";
import { provideServerCapability } from "../capabilities/provide-server-capability";
import { inProcessRoute } from "./in-process-route";

let handler: AdapterHandler | undefined;

/* Made with the first call that needs it. The limits it puts on a
   browser's body are no limits on what the server's own code sends it. */
function proxyOfProcess(): AdapterHandler {
  handler ??= createHandler({
    maxBodyBytes: Number.MAX_SAFE_INTEGER,
    maxUploadBytes: Number.MAX_SAFE_INTEGER,
  });
  return handler;
}

const IN_PROCESS_PROXY: InProcessProxyCapability = {
  route: (proxyPath, source) => inProcessRoute(proxyPath, source, proxyOfProcess),
};

/**
 * Let the server's own proxy callers reach its proxy in process. Called as
 * sources are registered — on a server, the one place they are.
 *
 * @example
 * ```ts
 * provideInProcessProxy();
 * ```
 */
export function provideInProcessProxy(): void {
  provideServerCapability("inProcessProxy", IN_PROCESS_PROXY);
}
