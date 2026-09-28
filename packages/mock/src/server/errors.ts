/** HTTP error thrown from mock handlers — carries a status code for proper HTTP response */
export class MockHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MockHttpError";
  }
}

export function isMockHttpError(err: unknown): err is MockHttpError {
  if (err instanceof MockHttpError) return true;
  // Duck-type check for cross-module boundary scenarios (child_process.fork)
  return (
    err instanceof Error &&
    err.name === "MockHttpError" &&
    typeof Reflect.get(err, "status") === "number"
  );
}
