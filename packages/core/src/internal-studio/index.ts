/**
 * `@noverax/courier/internal-studio` — what Studio's runtime takes of the
 * core wherever it runs, a page among them.
 *
 * **Internal subpath.** Public consumers must NOT depend on this module — it
 * exists for `@noverax/courier-studio-core/runtime`, whose browser build
 * Studio's plugins load into a development page, and which a Cloudflare
 * Worker loads too. `@noverax/courier/internal` holds the server's pieces
 * as well, and a page built for development keeps every module the entries
 * it imports reach: from here, the runtime takes Studio's hooks, the
 * registered sources and the adapters' announcements, and nothing of a
 * server's. What only a server's runtime answers — the Playground's calls,
 * a webhook's deliveries — it takes from `@noverax/courier/internal`.
 *
 * Stability: tracked alongside `@noverax/courier-studio-core` releases. No
 * semver guarantees for external consumers.
 */

export { getAppOrigin } from "../app-origin";
export {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "../config/studio-address";
export { getSources } from "../registered-sources";
export {
  type AnnounceHostingInput,
  announceHosting,
  type BufferedAnnouncement,
  consumeAnnouncements,
  type RuntimeTransport,
} from "../studio/announcements";
export { carriedBody } from "../studio/carried-body";
export {
  type BodyPart,
  createKeptBodies,
  KEPT_BODY_BYTES,
  type KeptBodies,
} from "../studio/kept-bodies";
export { studioHooks } from "../studio/singleton";
export { inCloudflareWorker } from "../utils/cloudflare-worker";
export { environmentVariable, inProduction, writtenOrOwn } from "../utils/environment";
export { parseUrl } from "../utils/parse-url";
export { sliceWhole } from "../utils/slice-whole";
