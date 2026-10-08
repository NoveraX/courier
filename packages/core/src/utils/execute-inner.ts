import { isHTTPError } from "../errors/http-error";
import type { HttpClient } from "../http-client/index";
import type { BoundMethodOptions, GroupOptions } from "../http-client/types";
import type { MiddlewareResponse } from "../middleware/types";
import type { StudioHooks } from "../studio";
import { answerShapeOf } from "../studio/answer-shape";
import type { SchemaMetadata } from "../validation";
import type { TimingState } from "./execute-studio";
import { validateResponse } from "./execute-validation";
import { isHeaders } from "./helpers";

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
 */
export async function executeInner(deps: InnerExecuteDeps): Promise<InnerResult> {
  const vars = deps.variables;
  const ft0 = deps.hasStudio ? performance.now() : 0;

  let response: Awaited<ReturnType<typeof deps.endpoint>>;
  try {
    response = await deps.endpoint(
      deps.instance.createMethods(
        {
          ...(deps.forwardVariables ? { variables: vars } : {}),
          ...deps.baseOptions,
          headers: deps.middlewareHeaders,
          stream: deps.stream,
        },
        deps.endpointGroupOptions,
      ),
      vars,
    );
  } catch (fetchError) {
    if (deps.hasStudio) deps.timing.tFetch = performance.now() - ft0;
    deps.dt.onHttpFetchError?.({
      requestId: deps.requestId,
      message: fetchError instanceof Error ? fetchError.message : String(fetchError),
      ...(isHTTPError(fetchError) && fetchError.status > 0 && { status: fetchError.status }),
      timestamp: Date.now(),
    });
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
  reportAnswerShape(deps, status, data);

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

  return {
    response: { status, data, headers },
    tRespValidation,
  };
}

/* The answer as it came, before the schema strips what it does not declare: Studio compares the two. */
function reportAnswerShape(deps: InnerExecuteDeps, status: number, data: unknown): void {
  if (!deps.hasStudio || !deps.dt.onAnswerShape || !deps.schema?.response || deps.stream) return;
  if (status < 200 || status > 299) return;
  const { shape, cut } = answerShapeOf(data);
  deps.dt.onAnswerShape({ requestId: deps.requestId, shape, cut, timestamp: Date.now() });
}
