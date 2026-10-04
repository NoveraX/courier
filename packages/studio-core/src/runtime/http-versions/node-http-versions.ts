import diagnostics from "node:diagnostics_channel";

import type { HttpVersion } from "../../events/http";
import { type HttpVersions, httpVersionFromProtocol, originVersions } from "./http-version";

/* What Node's fetch — undici — reports each request on as it writes it,
   with the socket the request goes out on. */
const SEND_HEADERS = "undici:client:sendHeaders";

/**
 * The HTTP versions a Node process's fetch calls go over, read from what
 * undici reports as it writes each request: the protocol its TLS socket
 * negotiated, or HTTP/1.1 on a plain socket, since undici speaks HTTP/2
 * only over TLS. A process whose fetch is not undici's reports nothing,
 * and its requests' version stays unknown.
 *
 * @returns What tells a request's version, and stops watching
 * @example
 * ```ts
 * const versions = observeNodeHttpVersions();
 * versions.versionOf("https://api.example.com/users"); // → "HTTP/2", once one went there
 * ```
 */
export function observeNodeHttpVersions(): HttpVersions {
  const versions = originVersions();
  const onSend = (message: unknown): void => {
    const seen = sentOver(message);
    if (seen) versions.note(seen.origin, seen.version);
  };
  diagnostics.subscribe(SEND_HEADERS, onSend);
  return {
    versionOf: versions.versionOf,
    dispose: () => {
      diagnostics.unsubscribe(SEND_HEADERS, onSend);
    },
  };
}

/* Where a request went and the version it went over, from undici's message. */
function sentOver(message: unknown): { origin: string; version: HttpVersion } | undefined {
  const origin = member(member(message, "request"), "origin");
  if (typeof origin !== "string" && !(origin instanceof URL)) return undefined;
  if (!URL.canParse(String(origin))) return undefined;
  const alpn = member(member(message, "socket"), "alpnProtocol");
  const version =
    typeof alpn === "string" && alpn !== "" ? httpVersionFromProtocol(alpn) : "HTTP/1.1";
  return version && { origin: new URL(String(origin)).origin, version };
}

function member(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
