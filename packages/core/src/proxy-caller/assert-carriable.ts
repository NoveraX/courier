import { ConfigurationError } from "../errors";
import { isRawBody } from "../utils/body-kind";

/**
 * Refuse variables the proxy has no way to carry.
 *
 * The proxy reads its envelope as JSON or as multipart form data. A Blob, a
 * stream or bytes encoded as JSON arrive empty or as numbered fields, and the
 * upstream answered that as a success. The caller hears about it instead,
 * before anything is sent.
 *
 * @param variables - The variables a proxy call was given
 * @throws ConfigurationError `PROXY_BODY_NOT_SUPPORTED` for a raw body
 *
 * @example
 * ```ts
 * assertCarriable({ id: 1 });          // passes
 * assertCarriable(new Blob(["data"])); // throws
 * ```
 */
export function assertCarriable(variables: unknown): void {
  if (!isRawBody(variables)) return;
  throw new ConfigurationError(
    "PROXY_BODY_NOT_SUPPORTED",
    "[courier] a proxy call carries its variables as JSON or FormData, so a Blob, bytes, a stream or URLSearchParams cannot travel through it. Append a file to a FormData instead, and let the endpoint's closure on the server shape the upstream body.",
  );
}
