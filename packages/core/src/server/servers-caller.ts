import { missingCapabilityCause } from "../capabilities/missing-capability";
import { ConfigurationError } from "../errors/configuration-error";
import { SERVERS_MODULES } from "../utils/servers-modules";
import { createCaller as callerOfTheRoot } from "./create-caller";

/**
 * The caller of `@noverax/courier/server`: the server's caller, as the
 * root's is, wherever the core's modules are the server's. Where a bundler
 * or a test environment took a page's modules for it — the `browser`
 * condition, Jest's jsdom environment among them, Node's
 * `--conditions=browser` — it is refused as it is made: built of a page's
 * modules, its calls would carry the page's session. The root's caller is
 * a page's there, as a page's bundle has it.
 *
 * @throws ConfigurationError `SERVER_CAPABILITY_MISSING` where the core's modules are a page's
 * @example
 * ```ts
 * import { createCaller } from "@noverax/courier/server";
 * const caller = createCaller(api); // in server code, tested in a node environment
 * ```
 */
export const createCaller = ((source: never, defaults?: never) => {
  if (!SERVERS_MODULES) {
    throw new ConfigurationError(
      "SERVER_CAPABILITY_MISSING",
      `[courier] createCaller from @noverax/courier/server makes the server's caller, and the core's modules here are a page's, whose calls carry the page's session; ${missingCapabilityCause()}.`,
    );
  }
  return callerOfTheRoot(source, defaults);
}) as unknown as typeof callerOfTheRoot;
