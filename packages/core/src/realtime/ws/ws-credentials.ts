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

const fromCaller = new WeakMap<CallerWSOptions, Partial<WSConnectionConfig>>();

/**
 * The connection options a caller's `ws` gives the sockets it opens: its
 * own, with `auth` sent in the first frame of every socket. The same `ws`
 * gives the same options, so the sockets a caller opens on one URL are one.
 *
 * @param ws - The caller's `ws`
 * @returns The options its sockets open with
 * @example
 * ```ts
 * executeWSChannel(url, topic, variables, socketOptions({ auth: () => ({ token }) }));
 * ```
 */
export function socketOptions(
  ws: CallerWSOptions | undefined,
): Partial<WSConnectionConfig> | undefined {
  if (ws === undefined) return undefined;
  let options = fromCaller.get(ws);
  if (options === undefined) {
    const { auth, ...rest } = ws;
    options =
      auth === undefined
        ? rest
        : { ...rest, credentials: async () => ({ frame: { auth: await authParams(auth) } }) };
    fromCaller.set(ws, options);
  }
  return options;
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
