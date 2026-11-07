import { isReactNative } from "../../utils/is-react-native";

/**
 * Whether this platform's WebSocket takes headers for its handshake: React
 * Native's does, and so do Node's and Bun's. A browser's never does, nor do
 * Deno's or a Cloudflare Worker's; there, what a socket proves who it is
 * with goes in its first frame instead.
 *
 * @returns `true` where a handshake can carry the headers a call would send
 * @example
 * ```ts
 * handshakeHeadersSupported(); // → true in Node, false in a browser
 * ```
 */
export function handshakeHeadersSupported(): boolean {
  if (isReactNative()) return true;
  if (Object.hasOwn(globalThis, "document")) return false;
  if (Object.hasOwn(globalThis, "Deno")) return false;
  if (userAgent() === "Cloudflare-Workers") return false;
  const proc: unknown = Object.hasOwn(globalThis, "process")
    ? Reflect.get(globalThis, "process")
    : undefined;
  const versions: unknown =
    typeof proc === "object" && proc !== null ? Reflect.get(proc, "versions") : undefined;
  return (
    typeof versions === "object" &&
    versions !== null &&
    typeof Reflect.get(versions, "node") === "string"
  );
}

function userAgent(): unknown {
  /* A browser's and a worker's navigator stand on the global's prototype; one Object.prototype holds is none. */
  const navigator: unknown = Reflect.get(globalThis, "navigator");
  return typeof navigator === "object" &&
    navigator !== null &&
    navigator !== Reflect.get(Object.prototype, "navigator")
    ? Reflect.get(navigator, "userAgent")
    : undefined;
}
