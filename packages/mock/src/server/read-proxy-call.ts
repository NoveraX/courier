import type { Context as HonoContext } from "hono";

import { formFields } from "../form-fields";
import { type BodyLimits, readRequestBody } from "./read-request-body";

/** The endpoint call a proxy request names, or why the request cannot be read */
export type ProxyCall =
  | { group: string; method: string; variables: unknown; raw: boolean }
  | { error: string; status: 400 | 413; group?: string; method?: string };

/** The fields a JSON body may have; the endpoint's names travel in the URL. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(["variables", "options"]);

/** The multipart field a proxy client writes first, holding the call's options */
const OPTIONS_FIELD = "_options";

/**
 * Read the call a proxy request names, as a Courier proxy reads it.
 *
 * The endpoint is named in the URL — `_s`, `_g`, `_m` — for a POST as for a
 * GET. A POST's body is `{ variables, options }` as JSON, or a form whose
 * first `_options` field holds the options; a GET carries its variables in
 * `_v` and its options in `_o`. A call that asks for the raw response
 * (`options.rawData`) is answered with the response around the data.
 *
 * @param c - The request's Hono context
 * @returns The group, method, variables and raw flag, or the error to answer 400 with
 * @example
 * ```ts
 * const call = await readProxyCall(c);
 * if ("error" in call) return c.json({ error: call.error }, 400);
 * ```
 */
export async function readProxyCall(c: HonoContext, limits?: BodyLimits): Promise<ProxyCall> {
  const params = new URL(c.req.url).searchParams;
  const method = params.get("_m");
  if (!params.get("_s") || !method) {
    return { error: "The endpoint is not named in the URL: _s and _m are required", status: 400 };
  }
  const group = params.get("_g") ?? "";
  const body = c.req.method === "GET" ? fromQuery(params) : await fromBody(c, limits);
  if ("error" in body) return { ...body, group, method };
  return { group, method, variables: body.variables, raw: isRaw(body.options) };
}

type Envelope = { variables: unknown; options: unknown } | { error: string; status: 400 | 413 };

function fromQuery(params: URLSearchParams): Envelope {
  const variables = parseJson(params.get("_v"));
  const options = parseJson(params.get("_o"));
  if (variables === INVALID || options === INVALID) {
    return { error: "_v and _o must be JSON", status: 400 };
  }
  return { variables, options };
}

async function fromBody(c: HonoContext, limits?: BodyLimits): Promise<Envelope> {
  const body = await readRequestBody(c, limits);
  if ("error" in body) return body;
  if (body.kind === "form") return fromForm(body.form);
  const { value } = body;
  if (value === undefined) return { variables: undefined, options: undefined };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "The body must be an object: { variables, options }", status: 400 };
  }
  const unknown = Object.keys(value).filter((key) => !ENVELOPE_KEYS.has(key));
  if (unknown.length > 0) {
    return {
      error: `The body may hold variables and options only, not ${unknown.join(", ")}`,
      status: 400,
    };
  }
  const fields = new Map(Object.entries(value));
  return { variables: fields.get("variables"), options: fields.get("options") };
}

/* The mock answers from plain values, so a form's fields become a record;
   its options travel in the first field of their name. */
function fromForm(form: FormData): Envelope {
  const fields = new FormData();
  let options: unknown;
  let optionsRead = false;
  for (const [key, value] of form.entries()) {
    if (key === OPTIONS_FIELD && !optionsRead) {
      optionsRead = true;
      options = typeof value === "string" ? parseJson(value) : INVALID;
    } else {
      fields.append(key, value);
    }
  }
  if (options === INVALID) return { error: "_options must be a JSON string", status: 400 };
  return { variables: formFields(fields), options };
}

function isRaw(options: unknown): boolean {
  return (
    typeof options === "object" &&
    options !== null &&
    "rawData" in options &&
    options.rawData === true
  );
}

const INVALID = Symbol("invalid JSON");

function parseJson(text: string | null): unknown {
  if (text === null || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return INVALID;
  }
}
