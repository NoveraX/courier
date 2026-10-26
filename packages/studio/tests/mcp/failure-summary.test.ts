/**
 * A failed request's line in an editor's list and in what Studio tells an
 * agent: what it failed with and, for one that got no answer, why — the
 * system's code and text — told once.
 */
import { describe, expect, it } from "vitest";

import { failureSummary } from "../../src/server/mcp/failure-summary";
import { gatherRequests, summaryOf } from "../../src/server/mcp/request-views";

describe("a failed request's line", () => {
  it("says why a request got no answer, with the code its text does not name", () => {
    expect(
      failureSummary({
        type: "unknown",
        message: "fetch failed",
        cause: {
          code: "UND_ERR_CONNECT_TIMEOUT",
          message: "Connect Timeout Error (attempted address: api.test:443, timeout: 10000ms)",
        },
      }),
    ).toBe(
      "fetch failed — UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.test:443, timeout: 10000ms)",
    );
    expect(
      failureSummary({
        type: "network",
        message: "Network request failed",
        cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
      }),
    ).toBe("Network request failed — getaddrinfo ENOTFOUND api.test");
  });

  it("is the failure's text alone when the cause says no more, or there is none", () => {
    const refused = "connect ECONNREFUSED 127.0.0.1:4010";

    expect(
      failureSummary({
        type: "unknown",
        message: refused,
        cause: { code: "ECONNREFUSED", message: refused },
      }),
    ).toBe(refused);
    expect(
      failureSummary({
        type: "timeout",
        message: "Request timed out after 50 ms",
        cause: { code: "TIMEOUT", message: "Request timed out" },
      }),
    ).toBe("Request timed out after 50 ms");
    expect(failureSummary({ type: "http", status: 404, message: "HTTP 404" })).toBe("HTTP 404");
    expect(failureSummary({ type: "unknown" })).toBeUndefined();
  });

  it("is the cause alone when the failure's own message says nothing", () => {
    const refused = "connect ECONNREFUSED ::1:4010; connect ECONNREFUSED 127.0.0.1:4010";

    expect(
      failureSummary({
        type: "network",
        message: "",
        cause: { code: "ECONNREFUSED", message: refused },
      }),
    ).toBe(refused);
    expect(
      failureSummary({
        type: "unknown",
        message: " ",
        cause: { code: "UND_ERR_SOCKET", message: "other side closed" },
      }),
    ).toBe("UND_ERR_SOCKET: other side closed");
  });

  it("is what a request's summary carries", () => {
    const gathered = gatherRequests([
      { type: "request:start", id: "r1", source: "api", method: "ping", timestamp: 1 },
      {
        type: "request:error",
        id: "r1",
        requestId: "r1",
        error: {
          type: "network",
          message: "Network request failed",
          cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4010" },
        },
        timestamp: 2,
      },
    ]).get("r1");

    expect(gathered && summaryOf("r1", gathered).error).toBe(
      "Network request failed — connect ECONNREFUSED 127.0.0.1:4010",
    );
  });
});
