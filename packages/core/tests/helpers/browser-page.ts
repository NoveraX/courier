import { vi } from "vitest";

import { _resetServerCapabilitiesForTests } from "../../src/capabilities/provide-server-capability";

/**
 * Run the calls that follow as a browser's page runs them, beside the proxy
 * a test serves in the same process: with a document, and with no proxy in
 * process to reach, as a page's bundle reads no slot a server lends — its
 * proxy client sends each call over HTTP. Call it once the sources are
 * registered, which lend the proxy in process.
 *
 * @example
 * ```ts
 * registerSources({ shop });
 * asBrowserPage();
 * ```
 */
export function asBrowserPage(): void {
  vi.stubGlobal("document", {});
  _resetServerCapabilitiesForTests("inProcessProxy");
}
