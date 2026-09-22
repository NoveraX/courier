/**
 * Where Studio listens, and where everything that talks to it dials.
 *
 * These were four sets of constants in three packages, and they disagreed on
 * both axes: the server bound port 4380 while every client and every documented
 * default said 6280, and the server bound the *name* `localhost` while the
 * clients dialled the literal `127.0.0.1`. On a host where `localhost` resolves
 * to `::1` — the common case — that second mismatch fails even once the ports
 * agree, because nothing is bound on IPv4.
 *
 * Both sides now read the same name, so whatever the resolver does, it does to
 * both of them.
 */

/** Host Studio binds, and the one its clients dial. */
export const STUDIO_DEFAULT_HOST: string = "localhost";

/** Port Studio binds, and the one its clients dial. */
export const STUDIO_DEFAULT_PORT: number = 6280;

/** The address a client uses when nothing is configured. */
export const STUDIO_DEFAULT_URL: string = `http://${STUDIO_DEFAULT_HOST}:${STUDIO_DEFAULT_PORT}`;
