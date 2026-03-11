import { HTTPError } from "../error";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { parseRequestPayload, type RequestPayload } from "../utils/request-payload";

export function buildHttpError(
  status: number,
  headers: Headers,
  responseData: unknown,
  requestPayload: { body?: FormData; json?: Partial<RequestPayload> },
): HTTPError {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  const { rawData } = options ?? {};

  const data =
    rawData && typeof responseData === "object" && responseData !== null && "data" in responseData
      ? (responseData as { data: unknown }).data
      : responseData;

  return new HTTPError({ status, headers, data });
}

export async function readErrorResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { success: false, message: `HTTP ${response.status}` };
  }
}

export async function sendFetch(
  method: "get" | "post",
  url: string,
  options: Record<string, unknown>,
  ctx: {
    stream: boolean;
    requestPayload: { body?: FormData; json?: Partial<RequestPayload> };
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: HTTPError) => void | Promise<void>;
  },
): Promise<unknown> {
  const { onDownloadProgress: _dp, ...fetchOptions } = options;

  try {
    const response = await coreFetch(method, url, fetchOptions as CoreFetchInit);

    if (!response.ok) {
      const responseData = await readErrorResponse(response);
      const httpError = buildHttpError(
        response.status,
        response.headers,
        responseData,
        ctx.requestPayload,
      );
      await ctx.onError?.(httpError);
      throw httpError;
    }

    if (ctx.stream) {
      await ctx.onSuccess?.(response);
      return response;
    }

    const data = await response.json();
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw error;
  }
}
