import { getSocket } from "@/socket";

/**
 * Emit a targeted cancel for the rid-keyed playground stream. The Studio
 * server routes the cancel to the owning runtime responder via the router's
 * `inFlight` map — non-owners see nothing, and the terminal event
 * (`playground:end` synthesized by the runtime or `playground:error` on
 * abort) updates the entry through the same store path as natural
 * completions.
 */
export function cancelServerStream(rid: string): void {
  getSocket().emit("playground:exec:cancel", { rid });
}
