import { isLocalAddress } from "../adapter/peer-address";
import { ConfigurationError } from "../errors/configuration-error";

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
 * address that is a path is the page's own origin, which the browser
 * decides for itself.
 *
 * @param url - Where the call goes
 * @returns The reason, or `undefined`
 * @example
 * ```ts
 * insecureTransport("http://api.example.com"); // "http://api.example.com is reached over plain HTTP …"
 * insecureTransport("http://api:8080"); // undefined
 * ```
 */
export function insecureTransport(url: string | undefined): string | undefined {
  if (url === undefined || !URL.canParse(url)) return undefined;
  const target = new URL(url);
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
