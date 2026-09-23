import { HTTPError } from "../errors";
import type { UploadProgress } from "../http-client/types";
import { createLogger } from "../logger";
import { studioHooks } from "../studio";
import { isFormData } from "../utils/helpers";
import type { RequestPayload } from "../utils/request-payload";
import { asProxyFailure, readProxyAnswer } from "./proxy-answer";
import { xhrUpload } from "./xhr-upload";

const log = createLogger("XhrHandler");

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
      log.warn("'cache' option is ignored when 'onUploadProgress' is set (XHR transport)");
    if (ctx.next)
      log.warn("'next' option is ignored when 'onUploadProgress' is set (XHR transport)");
    if (ctx.onDownloadProgress)
      log.warn(
        "'onDownloadProgress' option is ignored when 'onUploadProgress' is set (XHR transport)",
      );
  }

  const body = isFormData(ctx.variables)
    ? (ctx.requestPayload.body as FormData)
    : JSON.stringify(ctx.requestPayload.json);

  try {
    const dt = studioHooks;
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

    const data = await readProxyAnswer(response, ctx.requestPayload, ctx.stream);
    await ctx.globalOnSuccess?.(data);
    return data;
  } catch (error) {
    const failure = asProxyFailure(error);
    if (failure instanceof HTTPError) await ctx.globalOnError?.(failure);
    throw failure;
  }
}
