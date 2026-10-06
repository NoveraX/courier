import { describe, expect, it } from "vitest";

import { createFaultError, isFaultType, pickFault } from "../../src/network/failure";

function faultsPicked(config: Parameters<typeof pickFault>[0]): Set<string> {
  return new Set(Array.from({ length: 300 }, () => pickFault(config)));
}

describe("the faults a failing request is given", () => {
  it("are server errors when no fault types are named, never a request held until it times out", () => {
    expect(faultsPicked({ errorRate: 1 })).toEqual(new Set(["500", "503"]));
  });

  it("include a timeout when the fault types name one", () => {
    expect(faultsPicked({ errorRate: 1, faultTypes: ["timeout", "503"] })).toEqual(
      new Set(["timeout", "503"]),
    );
  });
});

describe("the words a simulated fault is answered with", () => {
  it("mark it simulated, which is how Studio tells it from a handler's own error", () => {
    expect(["500", "503", "502", "timeout", "reset", "interrupt"].map(createFaultError)).toEqual([
      { status: 500, message: "HTTP 500 Internal Server Error (simulated)", headers: {} },
      {
        status: 503,
        message: "HTTP 503 Service Unavailable (simulated)",
        headers: { "Retry-After": "5" },
      },
      { status: 502, message: "HTTP 502 Bad Gateway (simulated)", headers: {} },
      { status: 408, message: "Request Timeout (simulated)", headers: {} },
      { status: 502, message: "Connection Reset (simulated)", headers: {} },
      { status: 502, message: "Upload Interrupted (simulated)", headers: {} },
    ]);
  });

  it("name any error status by its reason, and one the registry does not name by its number", () => {
    const messages = ["400", "413", "415", "422", "507", "499"].map(
      (fault) => createFaultError(fault).message,
    );

    expect(messages).toEqual([
      "HTTP 400 Bad Request (simulated)",
      "HTTP 413 Content Too Large (simulated)",
      "HTTP 415 Unsupported Media Type (simulated)",
      "HTTP 422 Unprocessable Content (simulated)",
      "HTTP 507 Insufficient Storage (simulated)",
      "HTTP 499 (simulated)",
    ]);
  });

  it("send the headers a server sends with the status: a challenge with 401, when to retry with 429", () => {
    expect(createFaultError("401").headers).toEqual({ "WWW-Authenticate": 'Bearer realm="mock"' });
    expect(createFaultError("429").headers).toEqual({ "Retry-After": "5" });
    expect(createFaultError("404").headers).toEqual({});
  });

  it("answer a status that is no error with a 500, never a success", () => {
    expect(["200", "302", "abc", "600"].map((fault) => createFaultError(fault).status)).toEqual([
      500, 500, 500, 500,
    ]);
  });
});

describe("a fault type", () => {
  it("is an error status from 400 to 599, or a fault of the connection", () => {
    const named = ["400", "429", "599", "timeout", "reset", "interrupt"];
    const not = ["399", "600", "200", "4xx", "50", "5000", "slow", ""];

    expect(named.filter(isFaultType)).toEqual(named);
    expect(not.filter(isFaultType)).toEqual([]);
  });
});
