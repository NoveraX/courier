import { HTTPError } from "../errors";
import type { ResponseType } from "./types";

/** Statuses the HTTP specification defines as carrying no body at all. */
const BODILESS = new Set([204, 205, 304]);

/**
 * Read a response body, treating "there is no body" as a value rather than
 * as a parse failure.
 *
 * A HEAD request's only standard success is a 200 with no body, and a write
 * that returns nothing answers the same way. Handing those to `JSON.parse`
 * raises a syntax error, which the catch below turns into an `HTTPError`
 * carrying status 200 — a success reported as a transport failure, and
 * indistinguishable from one.
 */
export async function getResponseData(
  response: Response,
  responseType: ResponseType,
  responseParser?: (response: Response) => Promise<unknown>,
  message?: string,
): Promise<unknown> {
  if (BODILESS.has(response.status)) {
    return null;
  }

  try {
    if (responseParser) {
      return await responseParser(response);
    }

    switch (responseType) {
      case "text":
        return await response.text();
      case "blob":
        return await response.blob();
      case "arrayBuffer":
        return await response.arrayBuffer();
      case "formData":
        return await response.formData();
      default: {
        /* Reading the text first is what distinguishes an empty body from a
           malformed one; `response.json()` reports both as a syntax error. */
        const body = await response.text();
        return body === "" ? null : JSON.parse(body);
      }
    }
  } catch {
    const fallbackMessage = message || "Failed to parse response body";
    throw new HTTPError({
      status: response.status,
      headers: response.headers,
      data: { success: false, message: fallbackMessage },
    });
  }
}

export async function getResponse(
  response: Response,
  responseType: ResponseType,
  responseParser?: (response: Response) => Promise<unknown>,
  message?: string,
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const data = await getResponseData(response, responseType, responseParser, message);
  const { status, headers } = response;
  return { status, headers, data };
}
