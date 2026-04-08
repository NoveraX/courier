import { getSocket } from "@/socket";
import { stripComments } from "./json-editor";

/** Safely parse JSON with comment stripping, fallback on failure */
export function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(stripComments(json)) as T; } catch { return fallback; }
}

/** Send cancel signal for an active playground stream */
export function cancelServerStream(requestId: string): void {
  getSocket().emit("playground:stream:cancel", { requestId }, () => {});
}
