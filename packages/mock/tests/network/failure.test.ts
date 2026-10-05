import { describe, expect, it } from "vitest";

import { createFaultError, pickFault } from "../../src/network/failure";

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
    expect(["500", "503", "502", "timeout", "reset"].map(createFaultError)).toEqual([
      { status: 500, message: "HTTP 500 (simulated)" },
      { status: 503, message: "HTTP 503 (simulated)" },
      { status: 502, message: "HTTP 502 (simulated)" },
      { status: 408, message: "Request Timeout (simulated)" },
      { status: 502, message: "Connection Reset (simulated)" },
    ]);
  });
});
