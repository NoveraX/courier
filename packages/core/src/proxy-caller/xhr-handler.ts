import { devtoolsHooks } from "../devtools";
import { HTTPError } from "../error";
import type { UploadProgress } from "../http-client/types";
import { isFormData } from "../utils/helpers";
import type { RequestPayload } from "../utils/request-payload";
import { buildHttpError, readErrorResponse } from "./send-fetch";
import { xhrUpload } from "./xhr-upload";

export type XhrHandlerCtx = {
  url: string;
  requestPayload:
    | { body: FormData; json?: undefined }
    | { json: Partial<RequestPayload>; body?: undefined };
  variables: FormData | Record<string, unknown> | undefined;
  defaultHeaders?: Record<string, string>;
  credentials: RequestCredentials;
  timeout?: number;
  signal?: AbortSignal | null;
  onUploadProgress: (progress: UploadProgress) => void;
  stream: boolean;
  cache?: unknown;
  next?: Record<string, unknown>;
  onDownloadProgress?: unknown;
  globalOnSuccess?: (data: unknown) => void | Promise<void>;
  globalOnError?: (error: HTTPError) => void | Promise<void>;
};

export async function handleXhrUpload(ctx: XhrHandlerCtx): Promise<unknown> {
  if (process.env.NODE_ENV !== "production") {
    if (ctx.cache)
      console.warn(
        "[nexus] 'cache' option is ignored when 'onUploadProgress' is set (XHR transport)",
      );
    if (ctx.next)
      console.warn(
        "[nexus] 'next' option is ignored when 'onUploadProgress' is set (XHR transport)",
      );
    if (ctx.onDownloadProgress)
      console.warn(
        "[nexus] 'onDownloadProgress' option is ignored when 'onUploadProgress' is set (XHR transport)",
      );
  }

  const body = isFormData(ctx.variables)
    ? (ctx.requestPayload.body as FormData)
    : JSON.stringify(ctx.requestPayload.json);

  try {
    const dt = devtoolsHooks;
    const uploadId = `upload_${Date.now().toString(36)}`;

    const response = await xhrUpload(ctx.url, body, {
      headers: ctx.defaultHeaders,
      credentials: ctx.credentials,
      timeout: ctx.timeout || undefined,
      signal: ctx.signal || undefined,
      onProgress: (progress) => {
        ctx.onUploadProgress(progress);
        dt.onUploadProgress?.({
          requestId: uploadId,
          loaded: progress.transferredBytes,
          total: progress.totalBytes,
          percentage: progress.percent,
          timestamp: Date.now(),
        });
      },
    });

    dt.onUploadComplete?.({
      requestId: uploadId,
      timestamp: Date.now(),
    });

    if (!response.ok) {
      const responseData = await readErrorResponse(response);
      throw buildHttpError(response.status, response.headers, responseData, ctx.requestPayload);
    }

    if (ctx.stream) {
      await ctx.globalOnSuccess?.(response);
      return response;
    }

    const data = await response.json();
    await ctx.globalOnSuccess?.(data);
    return data;
  } catch (error) {
    if (error instanceof HTTPError) {
      await ctx.globalOnError?.(error);
      throw error;
    }
    throw error;
  }
}
