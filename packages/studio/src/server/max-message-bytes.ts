/**
 * The largest message Studio takes in one piece: a Socket.IO packet from a
 * runtime or the UI, or the JSON body of an API request. A response, a
 * stream message or playground variables of a few megabytes are common,
 * and a parsed specification — which generating, writing, updating and
 * managing an import all send back — can be tens of megabytes. The bound is
 * the largest specification Studio downloads.
 */
export const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
