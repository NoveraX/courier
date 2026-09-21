/**
 * Public surface for `@noverax/courier-studio-core/runtime`.
 *
 * The runtime entry point used by:
 *  - Framework adapter packages (`@noverax/courier-next`, `@noverax/courier-express`,
 *    etc.) — they import `attachRuntime`, `announceHosting`, and friends
 *  - User instrumentation files (`instrumentation.ts` for Next.js, `server.ts`
 *    for Express, etc.) — they import `attachRuntime`
 *  - Build plugins (`@noverax/courier-studio/{next,vite,webpack,...}`) — they
 *    inject `attachRuntime("<framework>-browser")` into client bundles
 *
 * Top-level `@noverax/courier-studio-core` exports types + EventBus only;
 * everything runtime-shaped lives here.
 */

export {
  type AnnounceHostingInput,
  announceHosting,
  type BufferedAnnouncement,
  consumeAnnouncements,
  type RuntimeTransport,
} from "./announce-hosting";
export { attachRuntime, type RuntimeHandle, type RuntimeKind } from "./attach-runtime";
export { type LoadedCourierConfig, loadCourierConfig } from "./load-config";
export { type PathAliases, readPathAliases } from "./path-aliases";
export { trackWSStream, untrackWSStream } from "./ws-tracking";
