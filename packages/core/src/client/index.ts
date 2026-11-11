/**
 * `@noverax/courier/client` — what a page takes from Courier: the callers,
 * the errors a call fails with, middleware, and the helpers a page uses
 * with them. The handlers, the request being served and the rest a server
 * runs come from `@noverax/courier/server`.
 *
 * `redact`, and the rules for what a credential looks like behind it,
 * come from the root: no call of a page needs them, and a bundler that
 * keeps every module an entry reaches — Next.js 15's Turbopack — keeps
 * none of them on a page that imports from here.
 *
 * Universal code — a page rendered on the server too — imports this entry
 * as well: on the server, its calls take the user's session and reach the
 * application's own proxy as the server lends them, once a request context
 * or the sources are registered there. Server code that names the request
 * it serves — `createCaller(api, { context: { req } })` — takes its caller
 * from `@noverax/courier/server`.
 */

export { createCaller } from "../caller";
export { AbortError, isAbortError } from "../errors/abort-error";
export { isCallFailure } from "../errors/call-failure";
export { ConfigurationError, isConfigurationError } from "../errors/configuration-error";
export { CourierError, isCourierError } from "../errors/courier-error";
export { HTTPError, isHTTPError } from "../errors/http-error";
export { isMissingTokenError, MissingTokenError } from "../errors/missing-token-error";
export { isNetworkError, NetworkError } from "../errors/network-error";
export { isRequestFailure } from "../errors/request-failure";
export { isTimeoutError, TimeoutError } from "../errors/timeout-error";
export { createFetch } from "../fetch";
export { createLogger, logger } from "../logger";
export { defineMiddleware } from "../middleware/define";
export { createProxyCaller } from "../proxy-caller/create-proxy-caller";
/* The realtime errors' base and a connection's; the others come with the
   realtime client, from `@noverax/courier/realtime`, and load with it. */
export { ConnectionError, RealtimeError } from "../realtime/realtime-error";
export { smoothProgress } from "../utils/smooth-progress";
export { isStreamedUpload } from "../utils/streamed-upload";
export { isValidationError, ValidationError } from "../validation";
/* Its types, each from the module that declares it, are named in public-types.ts. */
export type * from "./public-types";
