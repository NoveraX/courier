import { parseWireOptionsJson } from "../adapter/wire-options";
import type { CallOptions } from "../http-client/types";
import { isFormData } from "./helpers";

export type RequestPayloadInput = FormData | Partial<RequestPayload> | undefined;

export type RequestPayload = {
  source: string;
  group: string;
  method: string;
  variables: Record<string, unknown>;
  options: CallOptions<boolean>;
};

export const parseRequestPayload = (
  requestPayload: RequestPayloadInput,
): {
  source: FormDataEntryValue | string | undefined;
  group: FormDataEntryValue | string | undefined;
  method: FormDataEntryValue | string | undefined;
  variables: FormData | Record<string, unknown> | undefined;
  options: CallOptions<boolean> | undefined;
} => {
  let source: FormDataEntryValue | string | undefined;
  let group: FormDataEntryValue | string | undefined;
  let method: FormDataEntryValue | string | undefined;
  let variables: FormData | Record<string, unknown> | undefined;
  let options: CallOptions<boolean> | undefined;

  if (isFormData(requestPayload)) {
    const META_KEYS = new Set(["_source", "_group", "_method", "_options"]);

    source = requestPayload.get("_source") ?? undefined;
    group = requestPayload.get("_group") ?? undefined;
    method = requestPayload.get("_method") ?? undefined;

    const rawOptions = requestPayload.get("_options");
    if (typeof rawOptions === "string") {
      /* Validation belongs to the caller, which knows whether this payload
         came off the wire; a malformed field simply carries no options. */
      const accepted = parseWireOptionsJson(rawOptions);
      options = accepted.ok ? accepted.options : undefined;
    }

    const formData = new FormData();

    for (const [key, value] of requestPayload.entries()) {
      if (!META_KEYS.has(key)) {
        formData.append(key, value);
      }
    }

    variables = formData;
  } else {
    source = requestPayload?.source;
    group = requestPayload?.group;
    method = requestPayload?.method;
    options = requestPayload?.options;
    variables = requestPayload?.variables;
  }

  return { source, group, method, options, variables };
};
