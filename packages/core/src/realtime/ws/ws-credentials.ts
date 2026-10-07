import { handshakeHeadersSupported } from "./handshake-headers";
import type { CallerWSOptions, WSConnectionConfig } from "./ws-types";

/**
 * What a client tells the server about itself as it connects — a token, a
 * tenant — which `onConnect` reads as `auth`, as socket.io's server reads
 * its client's `auth`.
 */
export type WSAuthParams = Readonly<Record<string, unknown>>;

/**
 * A caller's `ws.auth`: the params, or a function that gives them. A
 * function is called anew before every socket opens and whenever the server
 * asks again, so the token it returns is the current one.
 */
export type WSAuth =
  | WSAuthParams
  | (() => WSAuthParams | undefined | Promise<WSAuthParams | undefined>);

/** The frame a socket proves who it is with: the first it sends, and each the server asks for again. */
export interface WSAuthFrame {
  /**
   * Headers the socket could not carry on its handshake — a browser's
   * `Authorization`, an API key — which the server reads as the handshake's
   */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** The caller's `ws.auth` */
  readonly auth?: WSAuthParams | undefined;
}

/** What one socket opens with. */
export interface WSCredentials {
  /** Headers for its handshake, where the platform lets a script set them */
  readonly handshake?: Readonly<Record<string, string>> | undefined;
  /** Its first frame */
  readonly frame?: WSAuthFrame | undefined;
}

/** The headers a socket's calls would send, as they are when it opens. */
export type SocketHeaders = () =>
  | Readonly<Record<string, string>>
  | Promise<Readonly<Record<string, string>>>;

/**
 * The connection options a caller's sockets open with: its `ws`, and what
 * each socket proves who it is with — the headers the caller's calls send
 * and its `ws.auth`, both asked for anew before every connect. The caller
 * makes them once and hands the same object to every channel, so its
 * channels on one URL share a socket.
 *
 * @param ws - The caller's `ws`
 * @param headers - The headers its sockets' calls would send, when there are any
 * @returns The options its sockets open with
 * @example
 * ```ts
 * executeWSChannel(url, topic, variables, socketOptions({ auth: () => ({ token }) }));
 * ```
 */
export function socketOptions(
  ws: CallerWSOptions | undefined,
  headers?: SocketHeaders,
): Partial<WSConnectionConfig> | undefined {
  const { auth, ...rest } = ws ?? {};
  if (auth === undefined && headers === undefined) return ws === undefined ? undefined : rest;
  return {
    ...rest,
    credentials: async () => {
      const params = auth === undefined ? undefined : await authParams(auth);
      return credentialsFor((await headers?.()) ?? {}, params);
    },
  };
}

/**
 * What a socket opens with: the headers its calls would send on its
 * handshake where the platform takes them there, in its first frame where
 * it does not — a browser's — and the caller's `ws.auth` in that frame.
 *
 * @param headers - The headers its calls would send
 * @param auth - The caller's `ws.auth`, as it is now
 * @param onHandshake - Whether the handshake can carry them
 * @returns The socket's credentials
 * @example
 * ```ts
 * credentialsFor({ authorization: "Bearer t1" }, { tenant: "acme" });
 * ```
 */
export function credentialsFor(
  headers: Readonly<Record<string, string>>,
  auth: WSAuthParams | undefined,
  onHandshake: boolean = handshakeHeadersSupported(),
): WSCredentials {
  if (Object.keys(headers).length === 0) return { frame: { auth } };
  return onHandshake ? { handshake: headers, frame: { auth } } : { frame: { headers, auth } };
}

/**
 * The params a caller's `ws.auth` gives now.
 *
 * @param auth - The caller's `ws.auth`
 * @returns The params, asked for anew when `auth` is a function
 * @example
 * ```ts
 * await authParams(() => ({ token: session.accessToken }));
 * ```
 */
export async function authParams(auth: WSAuth): Promise<WSAuthParams | undefined> {
  return typeof auth === "function" ? await auth() : auth;
}
