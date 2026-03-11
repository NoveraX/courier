import { HTTPError } from "../error";
import type { ResponseType } from "./types";

export async function getResponseData(
  response: Response,
  responseType: ResponseType,
  responseParser?: (response: Response) => Promise<unknown>,
  message?: string,
): Promise<unknown> {
  if (response.status === 204) {
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
      default:
        return await response.json();
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
