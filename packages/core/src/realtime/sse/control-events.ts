/**
 * Events a Courier SSE server sends about the stream itself.
 *
 * They tell the client how the stream ended, so it neither reconnects to a
 * stream that finished — which replayed it from the start, forever — nor
 * hands the app a failure as though it were one of the endpoint's events.
 * An endpoint cannot send an event whose name starts with the prefix, and
 * the client hands none of them to the app, those it does not know included.
 */
export const SSE_CONTROL_EVENTS = {
  /** The stream's handler returned; nothing more will come. */
  complete: "courier:complete",
  /** The stream's handler failed; the data is a `StreamFailure`. */
  error: "courier:error",
  /**
   * The server is going away. Its `retry` says when to reconnect, and the
   * client resumes from the last event the stream sent.
   */
  shutdown: "courier:shutdown",
  /** Reserved for the events above. */
  prefix: "courier:",
} as const;
