import { parseWireOptionsJson } from "../adapter/wire-options";
import type { CallOptions } from "../http-client/types";
import { isFormData } from "./helpers";

export type RequestPayloadInput = FormData | Partial<RequestPayload> | undefined;

export type RequestPayload = {
  source: string;
  group: string;
  method: string;
  /** Named values, a list, a JSON scalar or form data — see `executeRequest`. */
  variables: unknown;
  options: CallOptions<boolean>;
};

export const parseRequestPayload = (
  requestPayload: RequestPayloadInput,
): {
  source: FormDataEntryValue | string | undefined;
  group: FormDataEntryValue | string | undefined;
  method: FormDataEntryValue | string | undefined;
  variables: unknown;
  options: CallOptions<boolean> | undefined;
} => {
  let source: FormDataEntryValue | string | undefined;
  let group: FormDataEntryValue | string | undefined;
  let method: FormDataEntryValue | string | undefined;
  let variables: unknown;
  let options: CallOptions<boolean> | undefined;

  if (isFormData(requestPayload)) {
    const { meta, fields } = splitRouting(requestPayload);
    source = meta.get("_source");
    group = meta.get("_group");
    method = meta.get("_method");

    const rawOptions = meta.get("_options");
    if (typeof rawOptions === "string") {
      /* Validation belongs to the caller, which knows whether this payload
         came off the wire; a malformed field simply carries no options. */
      const accepted = parseWireOptionsJson(rawOptions);
      options = accepted.ok ? accepted.options : undefined;
    }

    variables = fields;
  } else {
    source = requestPayload?.source;
    group = requestPayload?.group;
    method = requestPayload?.method;
    options = requestPayload?.options;
    variables = requestPayload?.variables;
  }

  /* The multipart body names the group even when there is none, as an empty
     field; read as a group called "", it made every upload to an ungrouped
     endpoint unreachable once a boundary was declared. */
  return { source, group: group === "" ? undefined : group, method, options, variables };
};

const ROUTING_FIELDS: ReadonlySet<string> = new Set(["_source", "_group", "_method", "_options"]);

/**
 * Separate a multipart body's routing from the caller's own fields.
 *
 * The first field of each routing name is routing — the client writes those
 * first — and every later one is the caller's. A form's own `_method` or
 * `_options` therefore reaches the upstream instead of re-routing the call or
 * being read as its options.
 */
function splitRouting(body: FormData): {
  meta: Map<string, FormDataEntryValue>;
  fields: FormData;
} {
  const meta = new Map<string, FormDataEntryValue>();
  const fields = new FormData();
  for (const [key, value] of body.entries()) {
    if (ROUTING_FIELDS.has(key) && !meta.has(key)) meta.set(key, value);
    else fields.append(key, value);
  }
  return { meta, fields };
}
