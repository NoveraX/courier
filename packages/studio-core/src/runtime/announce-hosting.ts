/**
 * Adapter capability announcement buffer.
 *
 * The buffer + producer (`announceHosting`) lives in `@noverax/courier/announce`
 * so framework adapters (next, hono, fastify, …) can call it without depending
 * on `studio-core`. This module is the studio-core consumer surface — it
 * re-exports `consumeAnnouncements` along with the type aliases that the
 * runtime socket layer needs.
 */

export {
  type AnnounceHostingInput,
  announceHosting,
  type BufferedAnnouncement,
  consumeAnnouncements,
  type RuntimeTransport,
} from "@noverax/courier/announce";
