import { provideServerCapability } from "../capabilities/provide-server-capability";
import { SERVER_SESSION } from "./session/session-capability";

/**
 * Lend the calls of this process what a server does for them: the session
 * of the request being served. Every way into the core only a server
 * takes calls it — making a handler, registering sources or a request
 * context, a server's caller — so a page's code, which imports none of it,
 * finds it on the server it renders on. Calling it again changes nothing.
 *
 * @example
 * ```ts
 * provideServerCapabilities();
 * ```
 */
export function provideServerCapabilities(): void {
  provideServerCapability("session", SERVER_SESSION);
}
