/**
 * The largest message Studio takes in one piece: a Socket.IO packet from a
 * runtime or the UI. A response, a stream message or playground variables
 * of a few megabytes are common, and Socket.IO's default of 1 MB closed the
 * connection that sent one. The bound is the largest specification Studio
 * downloads.
 */
export const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
