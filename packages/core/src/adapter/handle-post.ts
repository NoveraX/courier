import type { StudioHooks } from "../studio/hooks";
import type { RequestPayloadInput } from "../utils/helpers";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { LIMITS } from "./limits";
import { isOriginAllowed } from "./origin-policy";
import { errorResponse } from "./parse";
import { readBoundedBody } from "./read-body";

type ExecuteFn = (
  request: Request,
  payload: RequestPayloadInput,
  proxyMethod: "GET" | "POST",
  proxyReceiveAt: number,
) => Promise<Response>;

export function createPostHandler(execute: ExecuteFn, dt: StudioHooks, config?: HandlerConfig) {
  return async (request: Request): Promise<Response> => {
    const proxyReceiveAt = performance.now();
    const origin = request.headers.get("origin");

    if (!isOriginAllowed(request, config?.allowedOrigins)) {
      dt.onProxyOriginReject?.({ origin: origin ?? "", timestamp: Date.now() });
      return refuse(request, 403, "Origin not allowed");
    }

    const body = await parseBody(request, config);
    if (body instanceof Response) return body;

    const proxySource = extractField(body, "_source", "source", "unknown");
    const proxyGroup = extractOptionalField(body, "_group", "group");
    const proxyMethod = extractField(body, "_method", "method", "unknown");

    dt.onProxyReceive?.({
      proxyMethod: "POST",
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      timestamp: Date.now(),
    });

    const proxyVariables = body instanceof FormData ? undefined : (body?.variables as unknown);

    dt.onProxyParse?.({
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      variables: proxyVariables,
      timestamp: Date.now(),
    });

    const response = await execute(request, body, "POST", proxyReceiveAt);

    dt.onProxyRespond?.({
      proxyMethod: "POST",
      source: proxySource,
      group: proxyGroup,
      method: proxyMethod,
      status: response.status,
      timestamp: Date.now(),
    });

    return response;
  };
}

/**
 * Read the envelope, spending a bounded amount of memory on it.
 *
 * The limit is chosen by media type before anything is read, because an
 * upload and a JSON envelope differ by orders of magnitude and one number
 * cannot be right for both. Parsing happens from the bytes already held, so
 * a body that passed the bound is never read twice.
 */
async function parseBody(
  request: Request,
  config?: HandlerConfig,
): Promise<RequestPayloadInput | Response> {
  const contentType = request.headers.get("content-type");
  /* Media types are case-insensitive (RFC 9110). */
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();

  const isUpload = mediaType === "multipart/form-data";
  if (!isUpload && mediaType !== "application/json") {
    return refuse(request, 415, "Unsupported Content-Type");
  }

  const limit = isUpload
    ? (config?.maxUploadBytes ?? LIMITS.MAX_PROXY_UPLOAD_BYTES)
    : (config?.maxBodyBytes ?? LIMITS.MAX_PROXY_BODY_BYTES);

  const body = await readBoundedBody(request, limit);
  if (!body.ok) return refuse(request, 413, `Request body exceeds ${body.limit} bytes`);

  /* Re-presenting the bytes lets the platform do the multipart parsing; the
     content type carries the boundary the parser needs. */
  if (isUpload) {
    try {
      return await new Response(body.bytes, {
        headers: { "content-type": contentType as string },
      }).formData();
    } catch {
      return errorResponse(400, "Invalid multipart body");
    }
  }

  try {
    return JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }
}

/** Answer a request without reading the rest of its body, and discard that rest. */
function refuse(request: Request, status: number, message: string): Response {
  discardBody(request);
  return errorResponse(status, message);
}

function extractField(
  body: RequestPayloadInput,
  formKey: string,
  jsonKey: string,
  fallback: string,
): string {
  if (body instanceof FormData) return String(body.get(formKey) ?? fallback);
  return ((body as Record<string, unknown>)?.[jsonKey] as string) ?? fallback;
}

function extractOptionalField(
  body: RequestPayloadInput,
  formKey: string,
  jsonKey: string,
): string | undefined {
  if (body instanceof FormData) return (body.get(formKey) as string | null) ?? undefined;
  return (body as Record<string, unknown>)?.[jsonKey] as string | undefined;
}
