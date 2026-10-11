import { resolveTransport } from "./resolve-transport";
import type { PlatformFetch } from "./source-transport";
import { TRANSPORT_KEYS } from "./transport-options";
import type { FetchOptions, GroupOptions } from "./types";

/** A request's options, with the `fetch` its group or its call sends it with in place of the source's. */
export type RequestOptions = Partial<FetchOptions> & { fetch?: PlatformFetch | undefined };

/**
 * A request's options with its group's and its call's transport laid over
 * the source's, which its client holds: the `dispatcher`, Bun's `proxy` and
 * `tls` and Deno's `client` the call sets, else those the nearest group
 * sets, handed to `fetch` in its `init`; and the `fetch` the call or the
 * group gives, under `fetch`, in place of the source's. Options that set
 * none of them are returned as they are.
 *
 * @param options - The call's options, as `.with()` gave them
 * @param group - The settings the endpoint's group gives, merged down its path
 * @returns The options to build the request from
 * @example
 * ```ts
 * const options = withCallTransport({ dispatcher: callAgent }, { dispatcher: groupAgent });
 * options.dispatcher === callAgent; // → true
 * ```
 */
export function withCallTransport(
  options: Readonly<Record<string, unknown>>,
  group: GroupOptions | undefined,
): Record<string, unknown> {
  const sets = (layer: object | undefined) =>
    layer !== undefined && TRANSPORT_KEYS.some((key) => Reflect.get(layer, key) !== undefined);
  if (!sets(group) && !sets(options)) return { ...options };
  const transport = resolveTransport(undefined, [group, options]);
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!(TRANSPORT_KEYS as readonly string[]).includes(key)) rest[key] = value;
  }
  return {
    ...rest,
    ...transport.connection,
    ...(transport.fetch && { fetch: transport.fetch }),
  };
}
