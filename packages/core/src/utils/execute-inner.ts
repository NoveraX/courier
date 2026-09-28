import type { HttpClient } from "../http-client/index";
import type { BoundMethodOptions, GroupOptions } from "../http-client/types";
import type { MiddlewareResponse } from "../middleware/types";
import type { StudioHooks } from "../studio";
import type { SchemaMetadata } from "../validation";
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
};

type InnerResult = {
  response: MiddlewareResponse;
  tFetch: number;
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
    deps.dt.onHttpFetchError?.({
      requestId: deps.requestId,
      message: fetchError instanceof Error ? fetchError.message : String(fetchError),
      timestamp: Date.now(),
    });
    throw fetchError;
  }

  const tFetch = deps.hasStudio ? performance.now() - ft0 : 0;

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
    tFetch,
    tRespValidation,
  };
}
