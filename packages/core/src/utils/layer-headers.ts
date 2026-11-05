import { sendableHeaders } from "./header-value";

/**
 * Lay sets of headers over one another, a later set winning name by name.
 *
 * Each set may take any form a call's options accept: a `Headers`, a list
 * of pairs, or a record whose unset entries are skipped. Names are compared
 * without regard to case, so `Authorization` given later replaces an
 * earlier `authorization` rather than being sent beside it. The result is a
 * plain record, which every transport reads the same way: a stream spread
 * its headers as a record, and a `Headers` has nothing to spread.
 *
 * @param layers - Sets of headers, earliest first; `undefined` is skipped
 * @returns Every header, under its lower-case name
 *
 * @example
 * ```ts
 * layerHeaders({ authorization: "t" }, new Headers({ "x-id": "1" }));
 * // → { authorization: "t", "x-id": "1" }
 * ```
 */
export function layerHeaders(...layers: readonly unknown[]): Record<string, string> {
  const headers = new Headers();
  for (const layer of layers) {
    sendableHeaders(layer).forEach((value, name) => {
      headers.set(name, value);
    });
  }
  return Object.fromEntries(headers);
}
