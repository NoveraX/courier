import { HTTP_VERBS } from "../define/probe";
import { ConfigurationError } from "../errors/configuration-error";
import { isHTTPError } from "../errors/http-error";
import type { HttpClient } from "../http-client/index";
import type { BoundMethodOptions, GroupOptions, HttpMethods } from "../http-client/types";
import type { MiddlewareResponse } from "../middleware/types";
import type { StudioHooks } from "../studio";
import type { SchemaMetadata } from "../validation";
import type { TimingState } from "./execute-studio";
import { validateResponse } from "./execute-validation";
import { isHeaders, isReadingMethod } from "./helpers";
import type { SharingCall } from "./shared-answer";

export type InnerExecuteDeps = {
  endpoint: (...args: unknown[]) => Promise<{ status?: number; data: unknown; headers?: unknown }>;
  instance: HttpClient;
  endpointGroupOptions: GroupOptions | undefined;
  middlewareHeaders: Headers;
  variables: unknown;
  forwardVariables: boolean;
  baseOptions: Omit<BoundMethodOptions, "variables" | "headers" | "stream">;
  stream: boolean;
  schema: SchemaMetadata | undefined;
  hasStudio: boolean;
  requestId: string;
  dt: StudioHooks;
  /** Where the fetch's duration is kept, whether it answers or fails. */
  timing: TimingState;
};

type InnerResult = {
  response: MiddlewareResponse;
  tRespValidation: number;
};

/**
 * Run the endpoint function, measure fetch timing, validate response.
 *
 * Each attempt a retry makes is told afresh whether another call's request
 * answered it: only the attempt that ends the call decides.
 */
export async function executeInner(deps: InnerExecuteDeps): Promise<InnerResult> {
  const vars = deps.variables;
  const ft0 = deps.hasStudio ? performance.now() : 0;
  deps.timing.shared = undefined;
  deps.timing.sent = false;

  let response: Awaited<ReturnType<typeof deps.endpoint>>;
  try {
    response = await deps.endpoint(
      keptToKind(
        deps.instance.createMethods(
          {
            ...(deps.forwardVariables ? { variables: vars } : {}),
            ...deps.baseOptions,
            headers: deps.middlewareHeaders,
            stream: deps.stream,
            ...(deps.hasStudio && { call: sharingCall(deps) }),
          },
          deps.endpointGroupOptions,
        ),
        deps.schema,
      ),
      vars,
    );
  } catch (fetchError) {
    /* A call refused before it was sent — its closure's verb of the other kind, variables no
       request carries — made no fetch: Studio is told of none, nor of a time it took. The
       mark is Studio's, set as a fetch starts. */
    if (deps.timing.sent) {
      deps.timing.tFetch = performance.now() - ft0;
      deps.dt.onHttpFetchError?.({
        requestId: deps.requestId,
        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
        ...(isHTTPError(fetchError) && { status: fetchError.status }),
        timestamp: Date.now(),
      });
    }
    throw fetchError;
  }

  const tFetch = deps.hasStudio ? performance.now() - ft0 : 0;
  deps.timing.tFetch = tFetch;

  deps.dt.onHttpFetchEnd?.({
    requestId: deps.requestId,
    status: response?.status || 200,
    duration: tFetch,
    timestamp: Date.now(),
  });

  const headers = isHeaders(response.headers) ? response.headers : new Headers();
  let data = response.data;
  const status = response?.status || 200;
  let tRespValidation = 0;
  reportAnswer(deps, status, data);

  /* A streamed answer is the upstream's bytes, not yet a value; the schema
     describes the value the caller reads from them. */
  if (deps.schema?.response && !deps.stream) {
    const validationCtx = {
      hasStudio: deps.hasStudio,
      requestId: deps.requestId,
      dt: deps.dt,
    };
    const result = await validateResponse(deps.schema.response, data, validationCtx);
    data = result.validated;
    tRespValidation = result.duration;
  }
  /* Then each stage `.map()` named, in turn, on what the schema checked. */
  if (!deps.stream) {
    for (const stage of deps.schema?.map ?? []) data = await stage(data, { status, headers });
  }

  return {
    response: { status, data, headers },
    tRespValidation,
  };
}

/**
 * The client a call's closure is handed, held to the kind of its endpoint.
 *
 * An endpoint is defined from the one branch of its closure that the probe
 * took, so a closure that reads there could write on a call, and go out
 * retried and cached as a read. Every call keeps to the kind its verb gave
 * the endpoint; `.reads()` lets a read post too, never put, patch or delete;
 * `.writes()` lets a write call any verb.
 */
function keptToKind(methods: HttpMethods, schema: SchemaMetadata | undefined): HttpMethods {
  const kind = schema?.type;
  const named = schema?.typeNamed === true;
  if (kind === undefined || (kind === "mutation" && named)) return methods;
  const kept: HttpMethods = { ...methods };
  for (const verb of HTTP_VERBS) {
    const reads = isReadingMethod(verb);
    if (kind === "mutation" ? !reads : reads || (named && verb === "post")) continue;
    kept[verb] = () => {
      throw new ConfigurationError(
        "ENDPOINT_VERB_KIND",
        `[courier] the closure called .${verb}() on an endpoint ${
          named
            ? ".reads() declared a read, which never calls .put(), .patch() or .del()"
            : `its verb made a ${kind === "query" ? "read" : "write"}: name its kind with .reads() or .writes()`
        }`,
      );
    };
  }
  return kept;
}

/* The call as the requests it shares know it: its Studio id, and where it notes whose request answered it. */
function sharingCall(deps: InnerExecuteDeps): SharingCall {
  return {
    id: deps.requestId,
    onShared: (answer) => {
      deps.timing.shared = answer;
    },
  };
}

/* The answer as it came, before the schema strips what it does not declare: Studio
   reads its shape and compares the two, with code only Studio's runtime brings. An
   answer another call's request brought is that request's, and told once, by it. */
function reportAnswer(deps: InnerExecuteDeps, status: number, data: unknown): void {
  if (!deps.hasStudio || !deps.dt.onAnswer || !deps.schema?.response || deps.stream) return;
  if (status < 200 || status > 299 || deps.timing.shared !== undefined) return;
  deps.dt.onAnswer({ requestId: deps.requestId, data, timestamp: Date.now() });
}
