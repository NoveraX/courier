/* The modules themselves, not their named exports: http.setGlobalProxyFromEnv() replaces the
   global agents, which an ESM named import of `globalAgent` would never see. */
import http, { type ProxyEnv } from "node:http";
import https from "node:https";
import { noProxyMatches } from "./no-proxy-matches";
import { SpecFetchError } from "./spec-fetch-error";

/** The proxy a request for a specification goes through. */
export interface SpecProxy {
  /** Its URL, credentials included, as the agent that connects through it takes it */
  readonly url: string;
  /** Its origin, without credentials: what a message names it by */
  readonly origin: string;
}

/**
 * The proxy Node's own requests to a URL go through, which Studio's go
 * through too: the one `HTTPS_PROXY` or `HTTP_PROXY` names — the lowercase
 * name first — once Node is told to use them, with `NODE_USE_ENV_PROXY=1`,
 * `--use-env-proxy` or `http.setGlobalProxyFromEnv()`, and none for a host
 * `NO_PROXY` names.
 *
 * @param url - Where the request goes
 * @returns The proxy, or `undefined` when the request goes directly
 * @throws {SpecFetchError} When the variable names no URL a proxy can be reached at
 * @example
 * ```ts
 * specProxyFor(new URL("https://api.example.com/openapi.json")); // { url, origin: "http://proxy.corp:3128" }
 * ```
 */
export function specProxyFor(url: URL): SpecProxy | undefined {
  const secure = url.protocol === "https:";
  const env = proxyEnvOf(secure ? https.globalAgent : http.globalAgent);
  if (env === undefined) return undefined;
  const given = secure ? env.https_proxy || env.HTTPS_PROXY : env.http_proxy || env.HTTP_PROXY;
  /* Node leaves a proxy of any other scheme to the application, and so does Studio. */
  if (!given || !/^https?:\/\//.test(given)) return undefined;
  const noProxy = env.no_proxy || env.NO_PROXY;
  const port = Number(url.port) || (secure ? 443 : 80);
  if (noProxy && noProxyMatches(noProxy, url.hostname.replace(/^\[|\]$/g, ""), port)) {
    return undefined;
  }
  return { url: given, origin: originOf(given, secure ? "HTTPS_PROXY" : "HTTP_PROXY") };
}

/* What Node built its global agent with: the environment once its proxy is on, nothing before. */
function proxyEnvOf(agent: object): ProxyEnv | undefined {
  const options: unknown = Reflect.get(agent, "options");
  const env: unknown =
    typeof options === "object" && options !== null ? Reflect.get(options, "proxyEnv") : undefined;
  return isProxyEnv(env) ? env : undefined;
}

function isProxyEnv(value: unknown): value is ProxyEnv {
  return typeof value === "object" && value !== null;
}

/* The value is never repeated: it may carry the proxy's password. */
function originOf(given: string, variable: string): string {
  try {
    return new URL(given).origin;
  } catch (cause) {
    throw new SpecFetchError(
      "SPEC_UNREACHABLE",
      `${variable} does not name a URL, so Studio cannot fetch through the proxy.`,
      { cause },
    );
  }
}
