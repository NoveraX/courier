import { HTTPError } from "@noverax/courier";

import type { Fixture } from "./fixture";

/**
 * The recording made of a call: the same endpoint, with the same variables.
 * Variables compare by value, whatever order their keys were written in.
 *
 * @param fixtures  The recordings to search
 * @param group     The endpoint's group, empty for a top-level endpoint
 * @param method    The endpoint's name
 * @param variables The call's variables
 * @returns The first matching recording, or `undefined`
 * @example
 * ```ts
 * findFixture(fixtures, "users", "getById", { id: 1 });
 * ```
 */
export function findFixture(
  fixtures: readonly Fixture[],
  group: string,
  method: string,
  variables: unknown,
): Fixture | undefined {
  const wanted = canonical(variables);
  return fixtures.find(
    (fixture) =>
      fixture.group === group &&
      fixture.method === method &&
      canonical(fixture.variables) === wanted,
  );
}

/**
 * Answer a call the way the recorded response answered it: with its data,
 * or, for an error status, by rejecting with the `HTTPError` a real call
 * rejects with — its status, headers and body included.
 *
 * @param fixture The recording
 * @param raw     Whether the call asked for the whole response (`client.raw`)
 * @returns The data, or `{ status, headers, data }` for a raw call
 * @throws HTTPError when the recorded status is 400 or above
 * @example
 * ```ts
 * replayAnswer(notFoundFixture, false); // throws HTTPError, status 404
 * ```
 */
export function replayAnswer(fixture: Fixture, raw: boolean): unknown {
  const { status, data } = fixture.response;
  const response = { status, headers: new Headers(fixture.response.headers), data };
  if (status >= 400) throw new HTTPError(response);
  return raw ? response : data;
}

/** JSON with object keys sorted, so equal values give equal strings */
function canonical(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, inner: unknown) => {
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) return inner;
    const entries = Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  });
}
