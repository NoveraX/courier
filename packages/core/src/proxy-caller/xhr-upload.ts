import type { UploadProgress } from "../http-client/types";

/**
 * Upload with real network-level progress via XMLHttpRequest.
 * Works on both HTTP/1.1 and HTTP/2, unlike ReadableStream + duplex which requires HTTP/2.
 */
export function xhrUpload(
  url: string,
  body: FormData | string,
  options: {
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    timeout?: number;
    signal?: AbortSignal;
    onProgress: (progress: UploadProgress) => void;
  },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    // "include" → always send cookies cross-origin
    // "omit" → never send cookies (even same-origin)
    // "same-origin" (default) → XHR default behavior (withCredentials = false)
    xhr.withCredentials = options.credentials === "include";

    if (options.timeout) {
      xhr.timeout = options.timeout;
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        // Skip content-type for FormData — browser sets it with multipart boundary
        if (!(body instanceof FormData && key.toLowerCase() === "content-type")) {
          xhr.setRequestHeader(key, value);
        }
      }
    }

    if (typeof body === "string") {
      xhr.setRequestHeader("content-type", "application/json");
    }

    const onAbort = () => xhr.abort();
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
    };

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        options.onProgress({
          percent: event.total > 0 ? event.loaded / event.total : 0,
          transferredBytes: event.loaded,
          totalBytes: event.total,
        });
      }
    });

    xhr.addEventListener("load", () => {
      cleanup();

      const headers = new Headers();
      for (const line of xhr.getAllResponseHeaders().trim().split("\r\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
        }
      }

      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers,
        }),
      );
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new TypeError("Network request failed"));
    });
    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new TypeError("Request timed out"));
    });

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }

    xhr.send(body);
  });
}
