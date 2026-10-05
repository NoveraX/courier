import { isSafeHttpOrigin } from "@noverax/courier-studio-core";

import type { CatalogEntry } from "@/store/types-ui";

type Transport = "http" | "sse" | "ws";

/**
 * Where a proxied call goes, as Studio shows it:
 *
 * - `absolute` — the source declared a URL with a scheme; it points wherever
 *   it says, which need not be the app.
 * - `resolved` — a relative path joined to the app's origin: the route is
 *   mounted on the app.
 * - `unresolved` — a relative path, but Studio knows no origin for the app:
 *   the path is shown as it is.
 */
export interface ProxyRoute {
  display: string;
  kind: "absolute" | "resolved" | "unresolved";
  /** Whether the source declared the route, or Courier's default applies. */
  declared: boolean;
}

const ABSOLUTE_URL = /^(https?|wss?):\/\//i;

/* The paths a proxy caller uses when a source declares none. A WebSocket
   has no default: its calls fail until one is declared. */
const DEFAULT_PATHS: Readonly<Partial<Record<Transport, string>>> = {
  http: "/api/request",
  sse: "/api/sse",
};

function displayOf(
  transport: Transport,
  raw: string,
  appOrigin: string | undefined,
): Pick<ProxyRoute, "display" | "kind"> {
  if (ABSOLUTE_URL.test(raw)) return { display: raw, kind: "absolute" };
  if (!appOrigin || !isSafeHttpOrigin(appOrigin)) return { display: raw, kind: "unresolved" };
  const url = `${appOrigin.replace(/\/+$/, "")}${raw.startsWith("/") ? raw : `/${raw}`}`;
  /* A relative WebSocket route is opened on the app's origin with `ws://`. */
  return { display: transport === "ws" ? url.replace(/^http/i, "ws") : url, kind: "resolved" };
}

/**
 * The route a source's proxied calls of a transport take: the one it
 * declares, or Courier's default, joined to the app's origin when it is a
 * path — or `undefined` for a WebSocket with none declared, whose proxied
 * calls fail.
 *
 * @param transport - The call's transport
 * @param source - The source
 * @returns The route, or `undefined` when there is none
 * @example
 * ```ts
 * proxyRouteOf("http", { baseURL, appOrigin: "http://localhost:5173", groups }); // { display: "http://localhost:5173/api/request", kind: "resolved", declared: false }
 * ```
 */
export function proxyRouteOf(
  transport: Transport,
  source: CatalogEntry | null,
): ProxyRoute | undefined {
  const declared = source?.proxyPath?.[transport];
  const raw = declared ?? DEFAULT_PATHS[transport];
  if (!raw) return undefined;
  return { ...displayOf(transport, raw, source?.appOrigin), declared: declared !== undefined };
}
