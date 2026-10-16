import type { RequestEntry } from "@/store/types";
import { networkHint } from "./network-hint";

/**
 * What usually fixes a request that failed this way, told from its kind
 * and status — for one that got no answer, from the system's code — or
 * nothing when they say too little to advise on.
 *
 * @param r - The request that failed
 * @returns The advice, or `undefined`
 * @example
 * ```ts
 * failureHint({ error: { type: "network", message: "Network request failed", cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" } }, statusCode: undefined, validated: undefined });
 * // "The API's host name did not resolve (ENOTFOUND). …"
 * ```
 */
export function failureHint(
  r: Pick<RequestEntry, "error" | "statusCode" | "validated" | "transport">,
): string | undefined {
  const kind = r.error?.type;
  const status = r.statusCode ?? r.error?.status;
  if (r.transport === "sse" || r.transport === "ws") {
    return "The stream ended with an error before the server closed it. The server's logs tell why; a proxy in between may also close connections it finds idle.";
  }
  if (kind === "validation") {
    return r.validated?.variables === "failed"
      ? "The variables did not match the endpoint's input schema, so the request was never sent. Fix the call's arguments, or the schema if it is the one that is wrong."
      : "The API's answer does not match the response schema the endpoint declares. Change the schema to what the API returns, or the API to what the schema promises.";
  }
  if (kind === "network") return networkHint(r.error?.cause);
  if (kind === "timeout" || status === 408 || status === 504) {
    return "The request ran out of time. Raise its timeout, or find out what makes the API slow to answer.";
  }
  if (status === undefined) return undefined;
  return httpHint(status);
}

function httpHint(status: number): string | undefined {
  if (status === 401) {
    return "The API did not accept the credentials the request carried. Check the token it sends, and when that token expires.";
  }
  if (status === 403) {
    return "The credentials were accepted, but they do not allow this call. Check the permissions or scopes they carry.";
  }
  if (status === 404) {
    return "Nothing was found at this URL. Check the path, the ids in it, and the source's baseURL.";
  }
  if (status === 429) {
    return "The API limits how often it is called. Wait as its Retry-After header says, or call it less often.";
  }
  if (status >= 500) {
    return "The API failed while answering. Its own logs tell why; when such failures pass, a retry middleware smooths them over.";
  }
  return undefined;
}
