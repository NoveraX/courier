import { createProxyCaller, type ProxyPath, type UploadProgress } from "@noverax/courier";
import type { CourierRoutes, Sources } from "@noverax/courier/define";
import {
  getAppOriginParsed,
  groupChain,
  groupNames,
  resolveProxyPath,
  routesOf,
} from "@noverax/courier/internal";
import { member } from "../member";
import { passHeaders, withoutPassHeader } from "./pass-headers";

/* A path on the app's own origin: one leading slash, not a protocol-relative URL. */
const RELATIVE_PATH = /^\/(?!\/)/;

/** A Playground call, as the responder runs it. */
export interface PlaygroundCall {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  headers: Record<string, string>;
  /** The request Studio shows the call under, which its one-time pass is issued for */
  requestId?: string | undefined;
}

/**
 * Call an endpoint through the app's proxy route, as the app's browser would.
 *
 * The client takes the routes the source's own definition gives — the
 * endpoints a page may call, and how it reaches each — as the app's page
 * takes them, so an endpoint no mark opens is refused before it is sent,
 * and it reaches the proxy at the source's `proxyPath` for the transport
 * the endpoint uses. A path
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
  const routes: CourierRoutes = isRecord(definition)
    ? routesOf(definition, call.source)
    : { source: call.source, endpoints: {} };
  assertMarked(definition, routes, call);
  const proxyPath = proxyPathFor(definition, transportOf(definition, call));
  const headers = { ...withoutPassHeader(call.headers), ...passOf(call, proxyPath) };
  const client: unknown = createProxyCaller(routes, {
    proxyPath,
    ...(Object.keys(headers).length > 0 && { headers }),
  });
  /* A redirect is followed on the route's origin alone: the call's headers
     and its pass are not taken to wherever the route, or what answers at
     its address, points. */
  const scoped = withOptions(client, {
    withinOrigin: true,
    ...(onUploadProgress && { onUploadProgress }),
  });
  const root = raw ? member(scoped, "raw") : scoped;
  const owner = groupNames(call.group).reduce(member, root);
  const endpoint = member(owner, call.method);
  if (typeof endpoint !== "function") {
    throw new Error(
      `${call.source}.${call.group ? `${call.group}.` : ""}${call.method} is not an endpoint`,
    );
  }
  return Reflect.apply(endpoint, owner, [call.variables]);
}

/* An endpoint the definition holds and no mark opens is refused here, with why, before
   the proxy refuses it as a name it does not know. */
function assertMarked(definition: unknown, routes: CourierRoutes, call: PlaygroundCall): void {
  const path = call.group ? `${call.group}.${call.method}` : call.method;
  if (Object.hasOwn(routes.endpoints, path)) return;
  const owner = groupChain(definition, call.group)?.at(-1) ?? definition;
  if (member(owner, call.method) === undefined) return;
  throw new Error(
    `${call.source}.${path} is not marked .expose(), so a page may not call it through the proxy: mark it where it is defined, or run it as server code, in Direct mode`,
  );
}

/** A transport a proxy path names a route for. */
export type Transport = keyof ProxyPath;

/* What a single call needs of the paths: the one its endpoint is reached by,
   found in its group — kept under `options.groups`, at any depth. */
function transportOf(definition: unknown, call: PlaygroundCall): Transport {
  const owner = groupChain(definition, call.group)?.at(-1) ?? definition;
  const kind = member(member(owner, call.method), "kind");
  if (kind === "stream") return "sse";
  return kind === "channel" ? "ws" : "http";
}

/**
 * The path a proxy client in this process reaches a source's transport by.
 * It has no page to resolve a relative path against, so the app's origin
 * stands in for one, asked for only then; a channel without a path is left
 * to the client, which says it needs one.
 *
 * @param definition - The source as registered
 * @param transport - The transport the call goes over
 * @returns The proxy path, with only that transport's entry
 * @example
 * ```ts
 * proxyPathFor(sources.api, "sse"); // → { sse: "http://localhost:3000/api/sse" }
 * ```
 */
export function proxyPathFor(definition: unknown, transport: Transport): ProxyPath {
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

/* A pass for the route the call is sent to, which only the app's own may carry. */
function passOf(call: PlaygroundCall, proxyPath: ProxyPath): Record<string, string> {
  if (call.requestId === undefined) return {};
  return passHeaders(call.requestId, proxyPath.http ?? proxyPath.sse ?? proxyPath.ws);
}

/* A client's `.with()` gives a client that sends every call with those options. */
function withOptions(client: unknown, options: Record<string, unknown>): unknown {
  const scope = member(client, "with");
  return typeof scope === "function" ? Reflect.apply(scope, client, [options]) : client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
