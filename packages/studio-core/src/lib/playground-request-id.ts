/* What a Studio request id may hold, and how long it may be. */
const UNSAFE = /[^A-Za-z0-9_-]/g;
const MAX_LENGTH = 64;

/**
 * The id Studio shows the request of a Playground run under, made from the
 * run's own id.
 *
 * The runtime runs the call under it, and the Playground finds the request by
 * it. Found by its endpoint and the time it started instead, a run took the
 * status, timing and headers of any other call the app made to the endpoint
 * meanwhile — a run that failed before it sent anything was shown as that
 * call's 200.
 *
 * @param rid - The run's id
 * @returns The request id: `pg_` and the run's id, as a request id may hold it
 * @example
 * ```ts
 * playgroundRequestId("dcd67e67-ce4e-4940-8f3d-34f6b873bf90");
 * // → "pg_dcd67e67-ce4e-4940-8f3d-34f6b873bf90"
 * ```
 */
export function playgroundRequestId(rid: string): string {
  return `pg_${rid.replace(UNSAFE, "")}`.slice(0, MAX_LENGTH);
}
