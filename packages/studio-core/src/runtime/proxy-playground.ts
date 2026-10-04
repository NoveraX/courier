import { createProxyCaller, type ProxyPath, type UploadProgress } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { getAppOriginParsed, resolveProxyPath } from "@noverax/courier/internal";

/* A path on the app's own origin: one leading slash, not a protocol-relative URL. */
const RELATIVE_PATH = /^\/(?!\/)/;

/** A Playground call, as the responder runs it. */
export interface PlaygroundCall {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
}

/**
 * Call an endpoint through the app's proxy route, as the app's browser would.
 *
 * The client is built from the source's own definition, so streams and
 * channels are told apart as they are in the app, and it reaches the proxy
 * at the source's `proxyPath` for the transport the endpoint uses. A path
 * relative to the app is resolved against the app's origin; without one —
 * `runtime.appOrigin` in courier.config or `COURIER_APP_URL` — this throws
 * `APP_ORIGIN_NOT_CONFIGURED`, which names both. An absolute path needs none.
 *
 * @param sources - The runtime's registered sources
 * @param call - The endpoint, its variables and headers
 * @param raw - Whether to answer with the status and headers around the data
 * @param onUploadProgress - Told how much of a form body has been sent
 * @returns What the endpoint's call returns: data, the raw answer, a
 *   subscription or a channel
 * @example
 * ```ts
 * const answer = await callThroughProxy(sources, { source: "api", group: "users", method: "list", variables: {}, headers: {} }, true);
 * ```
 */
export function callThroughProxy(
  sources: Sources,
  call: PlaygroundCall,
  raw: boolean,
  onUploadProgress?: (progress: UploadProgress) => void,
): unknown {
  const definition = Reflect.get(sources, call.source);
  const client: unknown = createProxyCaller<unknown>(call.source, {
    source: isRecord(definition) ? definition : undefined,
    proxyPath: proxyPathFor(definition, transportOf(definition, call)),
    ...(Object.keys(call.headers).length > 0 && { headers: call.headers }),
  });
  const scoped = onUploadProgress ? withOptions(client, { onUploadProgress }) : client;
  const root = raw ? member(scoped, "raw") : scoped;
  const owner = call.group ? member(root, call.group) : root;
  const endpoint = member(owner, call.method);
  if (typeof endpoint !== "function") {
    throw new Error(
      `${call.source}.${call.group ? `${call.group}.` : ""}${call.method} is not an endpoint`,
    );
  }
  return Reflect.apply(endpoint, owner, [call.variables]);
}

type Transport = keyof ProxyPath;

/* What a single call needs of the paths: the one its endpoint is reached by. */
function transportOf(definition: unknown, call: PlaygroundCall): Transport {
  const owner = call.group ? member(definition, call.group) : definition;
  const kind = member(member(owner, call.method), "kind");
  if (kind === "stream") return "sse";
  return kind === "channel" ? "ws" : "http";
}

/* A proxy client in this process has no page to resolve a relative path
   against; the app's origin stands in for it, and is asked for only then.
   A channel without a path is left to the client, which says it needs one. */
function proxyPathFor(definition: unknown, transport: Transport): ProxyPath {
  const declared = proxyPathOf(definition);
  const path = declared?.[transport];
  if (transport === "ws" && path === undefined) return {};
  const origin = path === undefined || RELATIVE_PATH.test(path) ? getAppOriginParsed() : undefined;
  const resolved = resolveProxyPath(transport, declared, origin);
  if (transport === "http") return { http: resolved };
  return transport === "sse" ? { sse: resolved } : { ws: resolved };
}

function proxyPathOf(definition: unknown): ProxyPath | undefined {
  const path = member(member(definition, "options"), "proxyPath");
  if (!isRecord(path)) return undefined;
  const pick = (key: "http" | "sse" | "ws"): string | undefined => {
    const value = path[key];
    return typeof value === "string" ? value : undefined;
  };
  return { http: pick("http"), sse: pick("sse"), ws: pick("ws") };
}

/* A client's `.with()` gives a client that sends every call with those options. */
function withOptions(client: unknown, options: Record<string, unknown>): unknown {
  const scope = member(client, "with");
  return typeof scope === "function" ? Reflect.apply(scope, client, [options]) : client;
}

function member(value: unknown, key: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
