/**
 * A saved session keeps why a request got no answer, checked as the runtime
 * checks it: a page or a session file can hold anything, and a saved
 * session is handed around.
 */
import { UNSHOWN_CAUSE } from "@noverax/courier/internal";
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
      cause: {
        code: "ECONNRESET",
        message: "failed: https://user:pass@api.test/v1?token=s3cret#x",
      },
    });

    expect(error?.cause).toEqual({ code: "ECONNRESET", message: "failed: https://api.test/v1" });
  });

  it("keeps no text without a system error code, and no cause in another shape", () => {
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

    expect(coded?.cause).toEqual({ message: UNSHOWN_CAUSE });
    expect(shapeless).not.toHaveProperty("cause");
  });

  it("keeps no token an error's text quoted", () => {
    const error = savedErrorOf({
      type: "unknown",
      message: 'Headers.append: "Bearer B34rer\nx" is an invalid header value.',
    });

    expect(error?.message).toBe('Headers.append: "[redacted]" is an invalid header value.');
  });
});
