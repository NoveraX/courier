import { getSourceName } from "@noverax/courier/define";
import type { BufferedAnnouncement } from "./announce-hosting";

/** What a runtime tells Studio it hosts, on `runtime:announce`. */
export interface AnnouncePayload {
  transports: ReadonlyArray<string>;
  sources: string[];
  listenOrigin?: string;
  framework?: string;
}

/**
 * Put an adapter's announcement on the wire: its sources by name, once each.
 *
 * @param entry - What the adapter announced
 * @returns The `runtime:announce` payload
 * @example
 * ```ts
 * socket.emit("runtime:announce", buildAnnouncePayload(entry));
 * ```
 */
export function buildAnnouncePayload(entry: BufferedAnnouncement): AnnouncePayload {
  const sources: string[] = [];
  for (const source of entry.sources) {
    const name = getSourceName(source);
    if (name && !sources.includes(name)) sources.push(name);
  }
  const payload: AnnouncePayload = { transports: entry.transports, sources };
  if (entry.listenOrigin !== undefined) payload.listenOrigin = entry.listenOrigin;
  if (entry.framework !== undefined) payload.framework = entry.framework;
  return payload;
}
