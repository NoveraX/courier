/** A part of the docs that answers a search: its page, and its heading when one part answers. */
export interface Answer {
  readonly page: string;
  readonly section?: string;
}

/** A search as a developer, or their editor's agent, makes it, and the parts that answer it. */
export interface Search {
  readonly query: string;
  readonly answers: readonly Answer[];
}

/**
 * The questions people bring to the docs, in their own words and
 * inflections — `cancelling`, `retries`, `uploading` — each with the
 * parts a reader would open for it, named from the pages themselves. A
 * change to how the docs are searched keeps each answer among the results
 * `docs_search` gives by default.
 */
export const SEARCHES: readonly Search[] = [
  {
    query: ".map() endpoint response",
    answers: [{ page: "core-concepts/defining-apis", section: "Mapping the answer" }],
  },
  {
    query: "mapping a response",
    answers: [{ page: "core-concepts/defining-apis", section: "Mapping the answer" }],
  },
  {
    query: "cancelling previous calls",
    answers: [{ page: "advanced/abort", section: "Cancelling the previous call" }],
  },
  { query: "cancel previous", answers: [{ page: "advanced/abort" }] },
  {
    query: "abort a call",
    answers: [{ page: "advanced/abort", section: "Aborting a call yourself" }],
  },
  {
    query: "identical requests deduplicated",
    answers: [{ page: "advanced/abort", section: "Identical reads share one request" }],
  },
  { query: "retries failed requests", answers: [{ page: "middleware/built-in" }] },
  { query: "retrying with backoff", answers: [{ page: "middleware/built-in" }] },
  {
    query: "uploading files with progress",
    answers: [
      { page: "advanced/upload", section: "Progress tracking" },
      { page: "api/create-proxy-caller", section: "Upload Progress" },
    ],
  },
  {
    query: "multiple file uploads",
    answers: [{ page: "advanced/upload", section: "Multi-file upload" }],
  },
  {
    query: "streaming an upload to the backend",
    answers: [{ page: "proxy-mode/uploads", section: "Sending an upload on as it arrives" }],
  },
  { query: "streamed responses", answers: [{ page: "advanced/streaming" }] },
  { query: "validating responses with zod", answers: [{ page: "validation/zod" }] },
  { query: "rate limited callers", answers: [{ page: "proxy-mode/rate-limits" }] },
  {
    query: "refreshing tokens",
    answers: [{ page: "middleware/built-in", section: "With token refresh" }],
  },
  {
    query: "invalidating the cache",
    answers: [{ page: "react-query/advanced", section: "Cache invalidation patterns" }],
  },
  {
    query: "infinite queries",
    answers: [{ page: "react-query/advanced", section: "Infinite queries" }],
  },
  {
    query: "prefetching data on the server",
    answers: [{ page: "react-query/advanced", section: "Prefetching and hydration" }],
  },
  {
    query: "dependent queries",
    answers: [{ page: "react-query/advanced", section: "Dependent queries" }],
  },
  { query: "redacted secrets", answers: [{ page: "api/redact" }] },
  { query: "signed webhooks", answers: [{ page: "advanced/webhooks" }] },
  { query: "tests from recorded traffic", answers: [{ page: "testing/recorded-tests" }] },
  { query: "importing an openapi specification", answers: [{ page: "studio/import-api" }] },
  { query: "exporting an openapi document", answers: [{ page: "advanced/openapi" }] },
  {
    query: "client certificates",
    answers: [
      { page: "advanced/proxies-and-certificates", section: "A bank's client certificate" },
    ],
  },
  {
    query: "cookies the API sets",
    answers: [{ page: "server-side/session", section: "The cookies the API sets" }],
  },
  { query: "server actions", answers: [{ page: "server-side/actions" }] },
  { query: "mocking responses in tests", answers: [{ page: "testing/mocking" }] },
  {
    query: "testing error handling",
    answers: [{ page: "testing/test-client", section: "Testing Error Handling" }],
  },
  {
    query: "reading response headers",
    answers: [{ page: "advanced/raw-data", section: "Reading response headers" }],
  },
  {
    query: "pagination headers",
    answers: [{ page: "advanced/raw-data", section: "Pagination headers" }],
  },
  {
    query: "serializing query parameters",
    answers: [{ page: "advanced/encoding", section: "searchParamsSerializer" }],
  },
  {
    query: "timeouts and retries",
    answers: [{ page: "advanced/options", section: "Timeout & retry" }],
  },
  {
    query: "option precedence",
    answers: [{ page: "advanced/options", section: "Option precedence" }],
  },
  {
    query: "sticky sessions",
    answers: [{ page: "deployment/replication", section: "Sticky Sessions" }],
  },
  {
    query: "redis pub/sub adapter",
    answers: [{ page: "deployment/redis", section: "Pub/Sub Adapter" }],
  },
  {
    query: "presence adapter",
    answers: [{ page: "deployment/redis", section: "Presence Adapter" }],
  },
  { query: "deploying on kubernetes", answers: [{ page: "deployment/kubernetes" }] },
  { query: "cloudflare workers", answers: [{ page: "deployment/cloudflare" }] },
  {
    query: "HTTPError",
    answers: [{ page: "api/http-error" }, { page: "core-concepts/error-handling" }],
  },
  { query: "createProxyCaller", answers: [{ page: "api/create-proxy-caller" }] },
  {
    query: "browsers only",
    answers: [{ page: "proxy-mode/rate-limits", section: "Browsers only" }],
  },
  { query: "network conditions", answers: [{ page: "studio/network-conditions" }] },
  { query: "contract drift", answers: [{ page: "studio/contract-drift" }] },
  {
    query: "path parameters",
    answers: [
      { page: "core-concepts/defining-apis", section: "Path Parameters" },
      { page: "advanced/path-params" },
    ],
  },
  {
    query: "query keys",
    answers: [
      { page: "api/create-query-keys" },
      { page: "react-query/use-query", section: "Auto-generated query keys" },
    ],
  },
  { query: "useMutation", answers: [{ page: "react-query/use-mutation" }] },
  {
    query: "requests another site sets off",
    answers: [{ page: "security/overview" }, { page: "server-side/session" }],
  },
  {
    query: "the user's session in next.js",
    answers: [{ page: "frameworks/nextjs", section: "The user's session" }],
  },
  {
    query: "UPSTREAM_TIMEOUT",
    answers: [{ page: "api/call-errors" }, { page: "proxy-mode/uploads" }],
  },
];
