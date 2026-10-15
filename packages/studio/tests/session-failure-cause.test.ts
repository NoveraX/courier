/**
 * A saved session keeps why a request got no answer, checked as the runtime
 * checks it: a page or a session file can hold anything, and a saved
 * session is handed around.
 */
import { describe, expect, it } from "vitest";

import { buildSession } from "../src/server/session-builder";

function savedErrorOf(error: unknown) {
  const session = buildSession({
    requests: [{ id: "r1", source: "api", method: "ping", startedAt: 1, error }],
    apps: [],
  });
  return session.requests[0]?.error;
}

describe("a saved request that got no answer", () => {
  it("keeps the system's code and text", () => {
    const error = savedErrorOf({
      type: "network",
      message: "Network request failed",
      cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
    });

    expect(error).toEqual({
      type: "network",
      message: "Network request failed",
      cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
    });
  });

  it("keeps no token, user or password a URL in the text carried", () => {
    const error = savedErrorOf({
      type: "network",
      message: "Network request failed",
      cause: { message: "failed: https://user:pass@api.test/v1?token=s3cret#x" },
    });

    expect(error?.cause).toEqual({ message: "failed: https://api.test/v1" });
  });

  it("drops a code that is not a system error code, and a cause in another shape", () => {
    const coded = savedErrorOf({
      type: "network",
      message: "Network request failed",
      cause: { code: "Bearer abc", message: "failed" },
    });
    const shapeless = savedErrorOf({
      type: "network",
      message: "Network request failed",
      cause: 7,
    });

    expect(coded?.cause).toEqual({ message: "failed" });
    expect(shapeless).not.toHaveProperty("cause");
  });
});
