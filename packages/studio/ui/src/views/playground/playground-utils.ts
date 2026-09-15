import { getSocket } from "@/socket";
import { stripComments } from "./json-editor";

/** Safely parse JSON with comment stripping, fallback on failure */
export function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(stripComments(json)) as T; } catch { return fallback; }
}

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
