/**
 * Adapter capability announcement buffer.
 *
 * The buffer + producer (`announceHosting`) lives in the core, where
 * framework adapters (next, hono, fastify, …) call it from
 * `@noverax/courier/announce` without depending on `studio-core`. This
 * module is the studio-core consumer surface — it re-exports
 * `consumeAnnouncements` along with the type aliases that the runtime
 * socket layer needs, from the entry the runtime takes in a page too.
 */

export {
  type AnnounceHostingInput,
  announceHosting,
  type BufferedAnnouncement,
  consumeAnnouncements,
  type RuntimeTransport,
} from "@noverax/courier/internal-studio";
