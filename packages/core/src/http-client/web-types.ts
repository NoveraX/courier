/**
 * The two `fetch` types the published declarations name, spelled so a
 * project typed for Node alone has them. `BodyInit` and `RequestCredentials`
 * are the DOM library's; Node's own types declare `Response` and
 * `RequestInit` but not them, and a declaration naming them did not compile
 * where the DOM library is not loaded.
 */

/** A body `fetch` sends or a `Response` carries. */
export type WebBody = NonNullable<ConstructorParameters<typeof Response>[0]>;

/** Whether a request sends the browser's credentials: `fetch`'s own values. */
export type WebCredentials = NonNullable<RequestInit["credentials"]>;
