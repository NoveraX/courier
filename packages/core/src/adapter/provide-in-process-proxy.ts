import { IN_PROCESS_PROXY } from "../proxy-caller/in-process-proxy";
import { type AdapterHandler, createHandler } from "./create-handler";

/**
 * Let the server's own proxy callers reach its proxy in process. Called as
 * sources are registered — on a server, the one place they are — and made
 * once per process; the handler is made with the first call that needs it.
 * The limits it puts on a browser's body are no limits on what the server's
 * own code sends it.
 *
 * @example
 * ```ts
 * provideInProcessProxy();
 * ```
 */
export function provideInProcessProxy(): void {
  if (typeof Reflect.get(globalThis, IN_PROCESS_PROXY) === "function") return;
  let handler: AdapterHandler | undefined;
  const provide = (): AdapterHandler => {
    handler ??= createHandler({
      maxBodyBytes: Number.MAX_SAFE_INTEGER,
      maxUploadBytes: Number.MAX_SAFE_INTEGER,
    });
    return handler;
  };
  Reflect.set(globalThis, IN_PROCESS_PROXY, provide);
}
