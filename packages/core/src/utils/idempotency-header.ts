import { ConfigurationError } from "../errors/configuration-error";

/* `header:` and a header's name, as HTTP allows one. */
const HEADER_KEY = /^header:([!#$%&'*+.^_`|~0-9A-Za-z-]+)$/;

/**
 * The header an endpoint's `idempotencyKey` names.
 *
 * @param idempotencyKey - The option as the endpoint gives it, `header:<name>`
 * @returns The header's name in lower case, or `undefined` for none
 * @throws ConfigurationError `INVALID_IDEMPOTENCY_KEY` for any other form
 * @example
 * ```ts
 * idempotencyHeader("header:Idempotency-Key"); // "idempotency-key"
 * ```
 */
export function idempotencyHeader(idempotencyKey: string | undefined): string | undefined {
  if (idempotencyKey === undefined) return undefined;
  const name = HEADER_KEY.exec(idempotencyKey)?.[1];
  if (name === undefined) {
    throw new ConfigurationError(
      "INVALID_IDEMPOTENCY_KEY",
      `[courier] idempotencyKey "${idempotencyKey}" names no header: write it as "header:<name>", for example "header:idempotency-key".`,
    );
  }
  return name.toLowerCase();
}
