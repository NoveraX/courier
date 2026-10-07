import { type SocketHeaders, socketOptions } from "../../realtime/ws/ws-credentials";
import type { CallerWSOptions, WSConnectionConfig } from "../../realtime/ws/ws-types";
import { layerHeaders } from "../../utils/layer-headers";
import type { StreamSession } from "./stream-session";

/** What a direct caller's channels open their sockets with. */
export interface DirectSocketDefaults {
  /** The caller's `ws` */
  readonly ws?: CallerWSOptions | undefined;
  /** The caller's `headers`, which its sockets send as its calls do */
  readonly headers?: Record<string, string> | undefined;
}

type SocketOptions = Partial<WSConnectionConfig> | undefined;

/* The sockets of the one user a browser or an app serves, and those that carry no one's session. */
const ONE_USER: object = {};
const ANYONE: object = {};

const opened = new WeakMap<DirectSocketDefaults, WeakMap<object, Map<string, SocketOptions>>>();

/**
 * The options a direct caller's channel opens its socket with: the caller's
 * `ws`, and the headers its calls send — the API's `headers`, the caller's,
 * the user's session's and `forward`'s — asked for anew before every
 * connect. A socket is kept to whose session it carries: the one user of a
 * browser or an app, the request being served on a server, so two users'
 * channels never share one.
 *
 * @param defaults - The caller's, the same object for all its channels
 * @param sourceHeaders - The API's `headers`
 * @param session - What the user's session gives the channel
 * @returns The options, once whose session it is has been found
 * @example
 * ```ts
 * executeWSChannel(url, topic, variables, directSocketOptions(defaults, sourceHeaders, session));
 * ```
 */
export async function directSocketOptions(
  defaults: DirectSocketDefaults,
  sourceHeaders: Readonly<Record<string, string>>,
  session: StreamSession | undefined,
): Promise<SocketOptions> {
  const found = await session?.found;
  const owner = found === undefined ? ANYONE : (found.incoming?.key ?? ONE_USER);
  const kind = session?.takes ?? "";
  const byOwner = memo(opened, defaults, () => new WeakMap<object, Map<string, SocketOptions>>());
  const byKind = memo(byOwner, owner, () => new Map<string, SocketOptions>());
  if (!byKind.has(kind)) {
    byKind.set(kind, socketOptions(defaults.ws, socketHeaders(defaults, sourceHeaders, session)));
  }
  return byKind.get(kind);
}

/* The headers a socket's calls would send as it opens: the session's under the API's and the caller's. */
function socketHeaders(
  defaults: DirectSocketDefaults,
  sourceHeaders: Readonly<Record<string, string>>,
  session: StreamSession | undefined,
): SocketHeaders | undefined {
  const fixed = layerHeaders(sourceHeaders, defaults.headers);
  if (session === undefined) return Object.keys(fixed).length > 0 ? () => fixed : undefined;
  return async () => layerHeaders((await session.current())?.headers, fixed);
}

function memo<TKey extends object, TValue>(
  map: WeakMap<TKey, TValue>,
  key: TKey,
  make: () => TValue,
): TValue {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}
