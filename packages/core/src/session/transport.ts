import { ConfigurationError } from "../errors/configuration-error";
import { isLocalAddress } from "../utils/local-address";
import { pageLocation } from "../utils/page-location";
import { parseUrl } from "../utils/parse-url";

/* Names only a private network resolves: mDNS, the ICANN private-use TLD,
   home routers, Kubernetes and Consul service discovery. */
const PRIVATE_SUFFIX = /\.(local|internal|lan|localdomain|home\.arpa|svc|cluster\.local|consul)$/;
/* 100.64.0.0/10, the shared range overlay networks such as Tailscale address peers in. */
const SHARED_RANGE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2}$/;

/**
 * Whether a host is reached without crossing the public internet: the local
 * machine, a private or link-local address, a single-label name such as a
 * container's or a cluster service's, or a name only a private network
 * resolves.
 *
 * @param hostname - The host, as a URL's `hostname` gives it
 * @returns `true` for a private host
 * @example
 * ```ts
 * isPrivateHost("api"); // true — a service on the same network
 * isPrivateHost("api.example.com"); // false
 * ```
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (isLocalAddress(host) || SHARED_RANGE.test(host)) return true;
  if (host.includes(":")) return false;
  if (/^[\d.]+$/.test(host)) return false;
  return !host.includes(".") || PRIVATE_SUFFIX.test(host);
}

/**
 * Why a session may not be sent to an address — or `undefined` when it may:
 * over HTTPS, or to a private host, where nothing on the way listens in. An
 * address with no scheme of its own is read against the page's: a path
 * stays on the page's own origin, which the browser decides for itself,
 * and one that names a host takes the page's scheme.
 *
 * @param url - Where the call goes
 * @returns The reason, or `undefined`
 * @example
 * ```ts
 * insecureTransport("http://api.example.com"); // "http://api.example.com is reached over plain HTTP …"
 * insecureTransport("http://api:8080"); // undefined
 * insecureTransport("//api.example.com"); // on a page served over HTTP: "http://api.example.com is reached …"
 * ```
 */
export function insecureTransport(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const absolute = parseUrl(url);
  /* An address with no scheme of its own is read against the page's: one that stays on the page's
     origin is a path there, and one that names a host, `//api.example.com`, takes the page's scheme. */
  const page = absolute === undefined ? pageAddress() : undefined;
  const target = absolute ?? (page === undefined ? undefined : parseUrl(url, page));
  if (target === undefined) return undefined;
  if (page !== undefined && target.origin === parseUrl(page)?.origin) return undefined;
  if (target.protocol === "https:" || target.protocol === "wss:") return undefined;
  if (isPrivateHost(target.hostname)) return undefined;
  return `${target.origin} is reached over plain HTTP across the public internet, where anyone on the way could read the session`;
}

/**
 * Refuse to send a session where `insecureTransport` says it may not go.
 *
 * @param target - Where the call goes, and the endpoint it is for
 * @throws ConfigurationError `SESSION_INSECURE_TRANSPORT`
 * @example
 * ```ts
 * assertSecureTransport({ url: "https://api.example.com", name: "api.users.me" }); // passes
 * ```
 */
export function assertSecureTransport(target: { url?: string | undefined; name: string }): void {
  const insecure = insecureTransport(target.url);
  if (insecure === undefined) return;
  throw new ConfigurationError(
    "SESSION_INSECURE_TRANSPORT",
    `${target.name}: ${insecure}. Reach it over HTTPS, or set session.allowHttp to send the session anyway`,
  );
}

/**
 * Refuse a request that would take a session off the origin it was checked
 * for — that of the call's `prefixUrl`, or of its API's `baseURL`, read
 * against the page where there is one. An endpoint whose path is an
 * absolute URL, or a closure's request, may name another host; what the
 * session gives a call is its API's alone, as are the cookies an answer
 * sets. Where neither names an address, off a page, nothing says where the
 * session belongs, and a request to any host is refused.
 *
 * @param target - Where the session was checked to go, and the endpoint
 * @param url - Where the request is about to be sent
 * @throws ConfigurationError `SESSION_OTHER_ORIGIN`, for a request to another origin
 * @example
 * ```ts
 * assertSessionOrigin({ url: "https://api.example.com/v1", name: "api.me" }, "https://api.example.com/me"); // passes
 * ```
 */
export function assertSessionOrigin(
  target: { url?: string | undefined; name: string },
  url: string,
): void {
  const page = pageAddress();
  const home = parseUrl(target.url ?? "", page)?.origin;
  const sent = parseUrl(url, page)?.origin;
  /* An address that does not parse is refused where it is sent, for what it is. */
  if (sent === undefined || sent === home) return;
  const remedy =
    home === undefined
      ? "which no baseURL names. Give the API the baseURL of that host"
      : `${home}. Give that host an API of its own`;
  throw new ConfigurationError(
    "SESSION_OTHER_ORIGIN",
    `${target.name} would send its API's session to ${sent}, and a session goes to its API's origin alone, ${remedy}, or give the endpoint { session: false }`,
  );
}

/* The address of the page the code runs on, where there is one. */
function pageAddress(): string | undefined {
  const href = pageLocation()?.href;
  return typeof href === "string" ? href : undefined;
}
