import { certificateTrust } from "./certificate-trust";
import { type NetworkFailure, networkFailureOf } from "./network-failure";

/* The app's own code failed — a middleware, pathOptions — because a request it made got no answer. */
const OWN_REQUEST =
  "A request the app's own code made on the way, in a middleware or in pathOptions, got no answer.";

/* The advice for a request the app's code sent itself: its host, its port and its timeout are that code's, not the source's. */
const ADVICE: Readonly<Record<NetworkFailure, (code: string) => string>> = {
  dns: (code) =>
    `The host name it called did not resolve (${code}). Check the address your code calls for a typo, and that this machine's network can resolve it: a host only a VPN or an internal DNS knows needs that network.`,
  "broken-answer": (code) =>
    `An answer began to come back to it, but it broke before it was whole (${code}): it was cut off, or its compression did not read. Check the server your code called, and any proxy in between that rewrites or compresses its answers.`,
  "no-headers": (code) =>
    `The host your code called took the connection but sent no headers in time (${code}): it is slow to answer, or hangs. Look at what it does for that request, or give the request your code makes a longer timeout.`,
  connection: (code) =>
    `The host your code called was found, but the connection to it failed (${code}). Check that it runs and listens on the port your code calls, and that no firewall, VPN or proxy in between drops the connection.`,
  certificate: (code) =>
    `The TLS certificate of the host your code called was not trusted (${code}). ${certificateTrust("that server")}`,
  redirects: () =>
    "The host your code called answered with redirects that never reached an answer: one points back to another, or each to the next. Check where its Location headers point, and the address your code calls.",
};

/**
 * What usually fixes a failure of the app's own code that a request it
 * made on the way caused — a token fetched in a middleware, a lookup in
 * pathOptions — told from the system's code, as {@link networkHint} tells
 * it for the API's own request, but of the host that code called: its
 * address, its port and its timeout are the code's own, never the source's.
 *
 * @param code - The code the system gave, one that says a request got no answer
 * @returns The advice
 * @example
 * ```ts
 * ownRequestHint("ENOTFOUND");
 * // "A request the app's own code made on the way, … The host name it called did not resolve (ENOTFOUND). …"
 * ```
 */
export function ownRequestHint(code: string): string {
  const failure = networkFailureOf(code);
  const advice =
    failure === undefined
      ? `Check that the host your code called runs and that this machine can reach it. The system reported ${code}.`
      : ADVICE[failure](code);
  return `${OWN_REQUEST} ${advice}`;
}
