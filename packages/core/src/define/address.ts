/**
 * Where an endpoint sits, relative to its group.
 *
 * An endpoint that described its wire carries the path its closure addressed;
 * one served in the defining process addressed nothing, and is reached by the
 * name it was given. Every transport that builds a URL asks here, so a path
 * written in a closure is honoured rather than silently replaced by the
 * property name.
 */
export function endpointPath(endpoint: unknown, method: string): string {
  if (typeof endpoint !== "object" || endpoint === null || !("path" in endpoint)) return method;
  const { path } = endpoint;
  return typeof path === "string" && path.length > 0 ? path : method;
}
