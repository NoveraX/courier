/**
 * Public surface for `@noverax/nexus-studio-core/runtime`.
 *
 * The runtime entry point used by:
 *  - Framework adapter packages (`@noverax/nexus-next`, `@noverax/nexus-express`,
 *    etc.) — they import `attachRuntime`, `announceHosting`, and friends
 *  - User instrumentation files (`instrumentation.ts` for Next.js, `server.ts`
 *    for Express, etc.) — they import `attachRuntime`
 *  - Build plugins (`@noverax/nexus-studio/{next,vite,webpack,...}`) — they
 *    inject `attachRuntime("<framework>-browser")` into client bundles
 *
 * Top-level `@noverax/nexus-studio-core` exports types + EventBus only;
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
export { type LoadedNexusConfig, loadNexusConfig } from "./load-config";
export { trackWSStream, untrackWSStream } from "./ws-tracking";
