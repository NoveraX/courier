import type { Socket } from "socket.io-client";
import { toast } from "sonner";

import { isPlainObject } from "./is-plain-object";

/* One notice however many changes are refused: a page without the token has every one refused. */
const NOTICE_ID = "studio-read-only";

/* Studio's own reason, for a refusal that came without one. */
const UNEXPLAINED =
  "Studio makes changes, and reads past what it shows, only for a page opened from the link it printed in its terminal, which carries this project's token.";

/**
 * Say why Studio did not do what this page asked: the page did not present
 * the token, so Studio answers each event but those that read what it
 * shows with `studio:read-only` — every change, and every read past what
 * it shows.
 *
 * @param socket - The page's `/ui` socket
 * @returns A function removing the listener
 * @example
 * ```ts
 * const unbind = bindReadOnly(getSocket());
 * ```
 */
export function bindReadOnly(socket: Socket): () => void {
  const onReadOnly = (data: unknown): void => {
    const reason = isPlainObject(data) && typeof data.error === "string" ? data.error : UNEXPLAINED;
    toast.error("Studio did not make the change", { id: NOTICE_ID, description: reason });
  };
  socket.on("studio:read-only", onReadOnly);
  return () => {
    socket.off("studio:read-only", onReadOnly);
  };
}
