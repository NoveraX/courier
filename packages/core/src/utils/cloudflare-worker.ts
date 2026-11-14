/**
 * Whether this is a Cloudflare Worker — workerd, deployed or under
 * `wrangler dev` — which names itself in `navigator.userAgent`.
 *
 * @returns `true` in a Worker
 * @example
 * ```ts
 * inCloudflareWorker(); // → true under `wrangler dev`, false in Node or a browser
 * ```
 */
export function inCloudflareWorker(): boolean {
  return userAgent() === "Cloudflare-Workers";
}

function userAgent(): unknown {
  /* A browser's and a worker's navigator stand on the global's prototype; one Object.prototype holds is none. */
  const navigator: unknown = Reflect.get(globalThis, "navigator");
  return typeof navigator === "object" &&
    navigator !== null &&
    navigator !== Reflect.get(Object.prototype, "navigator")
    ? Reflect.get(navigator, "userAgent")
    : undefined;
}
