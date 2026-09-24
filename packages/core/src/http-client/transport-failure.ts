import { HTTPError } from "../errors";

/**
 * The error a request that never got an answer is thrown as: status 0, with
 * the system's reason and code, and fetch's error as its cause.
 *
 * @param error - What fetch rejected with
 * @returns The HTTPError to throw
 */
export function transportFailure(error: Error): HTTPError {
  const cause = error.cause instanceof Error ? error.cause : error;
  const code = "code" in cause ? String(cause.code) : undefined;
  return new HTTPError(
    {
      status: 0,
      headers: new Headers(),
      data: { success: false, message: describe(cause, code), ...(code && { code }) },
    },
    { cause: error },
  );
}

/* A host that resolves to several addresses fails with an AggregateError
   whose own message is empty; its errors say which addresses refused. */
function describe(cause: Error, code: string | undefined): string {
  if (cause.message) return cause.message;
  if (cause instanceof AggregateError) {
    const reasons = cause.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e)));
    if (reasons.length > 0) return reasons.join("; ");
  }
  return code ?? "Request failed";
}
