import type { Sources } from "./define/types";
import { HTTPError } from "./error";
import type { CallOptions, Context } from "./http-client/types";
import type { CallerFn } from "./types";
import { executeRequest } from "./utils/execute";
import { parseEndpointKey } from "./utils/helpers";

export type CallerDefaults = {
  timeout?: number;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

const isContext = (value: unknown): value is Context =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (("req" in value && value.req instanceof Request) ||
    ("res" in value && value.res instanceof Response) ||
    ("headers" in value && value.headers instanceof Headers));

export function createCaller<T extends Sources>(
  sources: T,
  defaults: CallerDefaults = {},
): CallerFn<T, true> {
  const {
    timeout: defaultTimeout,
    headers: defaultHeaders,
    onError: globalOnError,
    onSuccess: globalOnSuccess,
  } = defaults;

  return function selectSource(source: string, options?: CallOptions<boolean>) {
    return async function execute(
      ...arguments_: [string, Context] | [string, Record<string, unknown>, Context]
    ) {
      const [endpoint] = arguments_;
      const { group, method } = parseEndpointKey(endpoint);

      const variables = isContext(arguments_[1]) ? undefined : arguments_[1];

      const mergedOptions: Record<string, unknown> = { ...options };

      if (mergedOptions.timeout === undefined && defaultTimeout !== undefined) {
        mergedOptions.timeout = defaultTimeout;
      }

      if (defaultHeaders) {
        mergedOptions.headers = options?.headers
          ? {
              ...defaultHeaders,
              ...Object.fromEntries(new Headers(options.headers as HeadersInit)),
            }
          : defaultHeaders;
      }

      const requestPayload = {
        source,
        group,
        method,
        variables,
        options: mergedOptions,
      };

      const contextArg = arguments_.length > 2 ? arguments_[2] : arguments_[1];
      const context = isContext(contextArg) ? contextArg : undefined;

      try {
        const result = await executeRequest(sources, requestPayload, context);
        await globalOnSuccess?.(result);
        return result;
      } catch (error) {
        if (error instanceof HTTPError) {
          await globalOnError?.(error);
        }
        throw error;
      }
    };
    // TypeScript cannot infer curried generic closures; cast verified by type tests
  } as unknown as CallerFn<T, true>;
}
