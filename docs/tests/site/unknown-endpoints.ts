/**
 * A page calls only the endpoints the site's sources describe: a call to
 * one they do not — `misc.health`, say, which the backend's own `/health`
 * is not — fails to compile, so `npm run check` and `next build` refuse
 * it rather than a reader's page answering 400. Nothing here runs: each
 * call below is one that must not compile, and the day one does, the
 * expectation over it fails the check instead.
 */
import { caller, middlewareCaller } from "@/lib/caller"
import { encodedQ, q } from "@/lib/query"

/**
 * Calls to endpoints the site does not describe, each of which the compiler refuses.
 *
 * @example
 * ```ts
 * // Never called: the compiler checks it.
 * ```
 */
export function useUnknownEndpoints(): void {
  // @ts-expect-error The misc group has no health endpoint
  void caller.misc.health()
  // @ts-expect-error The middleware demo's source has no posts group
  void middlewareCaller.posts.getAll()
  // @ts-expect-error The misc group has no health endpoint
  q.misc.useQuery("health")
  // @ts-expect-error The encoding demo's source has only the echo group
  encodedQ.users.useQuery("getAll")
}
