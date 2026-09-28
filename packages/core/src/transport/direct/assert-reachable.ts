import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import { ConfigurationError } from "../../errors/configuration-error";
import { resolveEndpoint } from "../../utils/execute-resolve";

/**
 * Refuse a direct call to a stream or channel this process serves.
 *
 * An endpoint defined with `.implement()` is served by the application's own
 * server, not by the API's `baseURL`, which is the upstream's: dialled there,
 * the stream found nothing and reconnected for good without an error. It is
 * refused when it is called, so the rest of the API stays callable.
 *
 * @param api - The API the direct caller was made from
 * @param group - The endpoint's group, empty for a flat one
 * @param method - The endpoint's name
 * @throws ConfigurationError `DIRECT_CALL_TO_SERVED_ENDPOINT` when the endpoint is served here
 *
 * @example
 * assertDirectlyReachable(api, "live", "ticks");
 */
export function assertDirectlyReachable(api: AnyDefinedApi, group: string, method: string): void {
  const { served } = resolveEndpoint(api as Record<string, unknown>, group, method);
  if (!served) return;
  const name = [getSourceName(api) ?? "_", group, method].filter(Boolean).join(".");
  throw new ConfigurationError(
    "DIRECT_CALL_TO_SERVED_ENDPOINT",
    `[courier] "${name}" is served by this process with .implement(), so a direct caller ` +
      "has no address to reach it at — its baseURL is the upstream's. Reach it through " +
      "createProxyCaller (or createProxyQueryCaller) and the server that serves it.",
  );
}
