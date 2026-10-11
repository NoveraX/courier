import type { SourceSocketOptions, SourceWebSocket } from "../../http-client/source-transport";
import { isReactNative } from "../../utils/is-react-native";
import { handshakeHeadersSupported } from "./handshake-headers";
import type { WSClientSocket, WSSocketFactory } from "./ws-types";

/* A WebSocket class, as each platform's constructor takes its protocols, headers and options. */
type PlatformWebSocket = new (url: string, init?: unknown, options?: unknown) => WSClientSocket;

/**
 * What opens a connection's sockets when it is given no factory: the class
 * the source names, constructed with an options object holding the socket's
 * protocols, its handshake headers and the source's connection options — or
 * the platform's `WebSocket`, given them in the shape it takes them. React
 * Native takes the headers as its third argument; Node's and Bun's take an
 * options object; a browser's and Deno's take protocols alone, and never
 * see the headers, which go in the socket's first frame there.
 *
 * @param webSocket - The source's `WebSocket` class, when it names one
 * @param init - What each socket's options carry besides protocols and headers
 * @returns The factory
 * @example
 * ```ts
 * const open = platformSocketFactory(undiciWebSocket, { dispatcher });
 * open("wss://feed.internal/ws", undefined, { authorization: "Bearer t1" });
 * ```
 */
export function platformSocketFactory(
  webSocket: SourceWebSocket | undefined,
  init: Readonly<Record<string, unknown>> | undefined,
): WSSocketFactory {
  return (url, protocols, headers) => {
    if (webSocket !== undefined) {
      return new (webSocket as unknown as PlatformWebSocket)(
        url,
        optionsOf(protocols, headers, init),
      );
    }
    /* Read as each socket opens, so a WebSocket installed after the connection was made is the one used. */
    const Socket = WebSocket as unknown as PlatformWebSocket;
    if (isReactNative()) {
      return headers === undefined
        ? new Socket(url, protocols)
        : new Socket(url, protocols, { headers });
    }
    if (headers === undefined && (init === undefined || !handshakeHeadersSupported())) {
      return new Socket(url, protocols);
    }
    return new Socket(url, optionsOf(protocols, headers, init));
  };
}

function optionsOf(
  protocols: string[] | undefined,
  headers: Readonly<Record<string, string>> | undefined,
  init: Readonly<Record<string, unknown>> | undefined,
): SourceSocketOptions {
  return { ...init, ...(protocols && { protocols }), ...(headers && { headers }) };
}
