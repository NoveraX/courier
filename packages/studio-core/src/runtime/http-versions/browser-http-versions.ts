import {
  type HttpVersions,
  httpVersionFromProtocol,
  originOf,
  originVersions,
} from "./http-version";

/**
 * The HTTP versions a page's requests go over, read from the Resource
 * Timing the browser keeps — the protocol the page itself and each
 * resource since were fetched over. Another origin tells its protocol only
 * when it lets its timing be read, with `Timing-Allow-Origin`; until then
 * the version of a request to it stays unknown.
 *
 * @returns What tells a request's version, and stops watching
 * @example
 * ```ts
 * const versions = observeBrowserHttpVersions();
 * versions.versionOf(`${location.origin}/api/request`); // → the page's own version
 * ```
 */
export function observeBrowserHttpVersions(): HttpVersions {
  const versions = originVersions();
  if (typeof PerformanceObserver === "undefined" || typeof performance === "undefined") {
    return { versionOf: () => undefined, dispose: () => {} };
  }
  const note = (entry: PerformanceEntry): void => {
    if (!("nextHopProtocol" in entry) || typeof entry.nextHopProtocol !== "string") return;
    const version = httpVersionFromProtocol(entry.nextHopProtocol);
    const origin = originOf(entry.name);
    if (version && origin) versions.note(origin, version);
  };
  for (const entry of performance.getEntriesByType("navigation")) note(entry);
  for (const entry of performance.getEntriesByType("resource")) note(entry);
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) note(entry);
  });
  observer.observe({ type: "resource" });
  return { versionOf: versions.versionOf, dispose: () => observer.disconnect() };
}
