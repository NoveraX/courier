import { describe, expect, it } from "vitest";

import { pickFault } from "../../src/network/failure";

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
