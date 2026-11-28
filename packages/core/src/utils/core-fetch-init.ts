import type { PlatformFetch } from "../http-client/source-transport";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import type { RequestQuery } from "./search-params";
import type { SharingCall } from "./shared-answer";

/** What `coreFetch` sends a request with: fetch's own options, and Courier's. */
export type CoreFetchInit = Omit<RequestInit, "method" | "body" | "signal"> & {
  /** What the request sends; absent, nothing unless `json` is given. */
  body?: WebBody | null | undefined;
  signal?: AbortSignal | null | undefined;
  json?: unknown;
  searchParams?: RequestQuery | undefined;
  timeout?: number | undefined;
  onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
  onDownloadProgress?: ((progress: DownloadProgress) => void) | undefined;
  /**
   * Follow redirects only while they stay on the request's origin — see
   * `fetchWithinOrigin`, and `keptWithinOrigin` for what each hop is sent
   * with. An explicit `redirect` takes precedence.
   */
  withinOrigin?: boolean | undefined;
  /**
   * Sends the request in place of `fetch`: the route a proxy caller takes
   * to the proxy of the server it runs in, without leaving the process.
   */
  transport?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
  /** Sends the request in place of the platform's `fetch` and of XMLHttpRequest: the source's own. */
  fetch?: PlatformFetch | undefined;
  /**
   * Join an identical read already in flight, or answer it with the one the
   * render being served made, rather than send another — the default;
   * `false` sends this one alone.
   */
  coalesce?: boolean | undefined;
  /**
   * The request being served the call is made for, when the answer may set
   * that visitor's session: a read made for one never joins a read made for
   * another, however alike they are.
   */
  servedFor?: object | undefined;
  /**
   * The endpoint is declared a read, whatever verb carries it, or a write:
   * which of them an identical request in flight may join. Unsaid, a request
   * sent as `GET`, `HEAD` or `QUERY` reads.
   */
  reads?: boolean | undefined;
  /**
   * The call the request is made for, as Studio measures it: told when its
   * read is answered by another call's request. Never part of what makes
   * two requests identical.
   */
  call?: SharingCall | undefined;
  /**
   * The call reads its answer as it arrives, through the answer's `stream`:
   * it shares no request in flight, never goes through XMLHttpRequest, which
   * hands an answer over only whole, and a download it reports is counted on
   * that stream.
   */
  streamed?: boolean | undefined;
};
