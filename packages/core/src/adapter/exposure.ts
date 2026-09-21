/**
 * Whether the browser may reach an endpoint at all.
 *
 * The proxy addresses endpoints by name — `?_s=api&_g=admin&_m=exportPayouts`
 * — and resolves that name in the process-global registry. Every source the
 * application declared is in there, including the ones only server code was
 * ever meant to call, and the registry cannot tell the two apart. So an
 * endpoint written for a cron job is reachable from a page, and reachable
 * *with the server's credentials*, which is the whole point of the proxy.
 *
 * `expose` is where that is said. It lives on the source and on the group
 * rather than on each endpoint, so shutting a whole API off from the browser
 * is one line in the config and no change to any declaration. An endpoint that
 * needs its own answer gets it by living in its own group.
 *
 * A refused call is answered exactly as an unknown name is. Saying "forbidden"
 * would confirm that the endpoint exists, which is the one thing a caller
 * guessing names is trying to learn.
 */

/** The shape this reads; both levels are optional and default to exposed. */
interface ExposableOptions {
  expose?: boolean;
  groups?: Record<string, { options?: { expose?: boolean } }>;
}

/**
 * Decide whether a named endpoint may be served to a caller off the wire.
 *
 * @param dataSource - The source as it sits in the registry
 * @param group - Group name from the request, when it named one
 * @returns Whether the proxy may serve it
 *
 * @example
 * ```ts
 * defineApi({ expose: false, groups: { public: defineGroup({ expose: true, … }) } });
 * ```
 */
export function isExposedToWire(dataSource: unknown, group: string | undefined): boolean {
  const options = (dataSource as { options?: ExposableOptions } | undefined)?.options;
  if (!options) return true;

  if (group !== undefined) {
    const groupExpose = options.groups?.[group]?.options?.expose;
    if (groupExpose !== undefined) return groupExpose;
  }

  return options.expose ?? true;
}
