import type { CallOptions } from "../http-client/types";

export type RequestPayloadInput = Partial<RequestPayload> | undefined;

export type RequestPayload = {
  source: string;
  group: string;
  method: string;
  /** Named values, a list, a JSON scalar or form data — see `executeRequest`. */
  variables: unknown;
  options: CallOptions<boolean>;
};

/**
 * Read the call a payload describes.
 *
 * A group named as the empty string is no group, so a caller that writes
 * one for an ungrouped endpoint reaches it, boundary or not.
 *
 * @param requestPayload - The call: its endpoint, variables and options
 * @returns The same call, its group normalized
 *
 * @example
 * ```ts
 * parseRequestPayload({ source: "api", group: "", method: "ping" }); // group → undefined
 * ```
 */
export const parseRequestPayload = (
  requestPayload: RequestPayloadInput,
): {
  source: string | undefined;
  group: string | undefined;
  method: string | undefined;
  variables: unknown;
  options: CallOptions<boolean> | undefined;
} => {
  const group = requestPayload?.group;
  return {
    source: requestPayload?.source,
    group: group === "" ? undefined : group,
    method: requestPayload?.method,
    variables: requestPayload?.variables,
    options: requestPayload?.options,
  };
};
