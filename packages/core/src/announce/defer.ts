/**
 * Announcing what an adapter hosts, without reading the registry too early.
 *
 * An adapter factory used to announce as it was constructed, which meant
 * reading the source registry at that moment. In most runtimes the factory
 * runs while the application wires its routes, after the sources are
 * registered, and that is fine. Next.js is different: it evaluates every
 * route module during `next build` to collect page data, long before any
 * `register()` hook has run. Reading the registry there throws, and the
 * build fails on the documented quickstart.
 *
 * Deferring to the first request costs nothing — an announcement exists to
 * tell Studio which runtime serves which sources, and nothing can be served
 * before a request anyway.
 */

/**
 * Wrap an announcement so it happens once, on the first call, not before.
 *
 * @param announce - What to announce, evaluated at the first call
 * @returns A function to call on each request; only the first one announces
 *
 * @example
 * ```ts
 * const announce = deferAnnounce(() =>
 *   announceHosting({ transports: ["http"], sources: Object.values(requireSources()) }),
 * );
 *
 * return { GET: (request) => { announce(); return handleGet(request); } };
 * ```
 */
export function deferAnnounce(announce: () => void): () => void {
  let announced = false;

  return () => {
    if (announced) return;
    announced = true;
    announce();
  };
}
