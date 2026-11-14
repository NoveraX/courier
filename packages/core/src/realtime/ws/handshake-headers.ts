import { inCloudflareWorker } from "../../utils/cloudflare-worker";
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
  if (inCloudflareWorker()) return false;
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
