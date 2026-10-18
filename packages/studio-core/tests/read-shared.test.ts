/**
 * The one reading of a call's shared mark that the runtime, Studio's
 * server and its page all use: kept only in the shape the runtime gives it.
 */
import { describe, expect, it } from "vitest";

import { readShared } from "../src/events/read-shared";

describe("readShared", () => {
  it("keeps how a read was shared, and the call that answered when named", () => {
    expect(readShared({ by: "flight", with: "req_1" })).toEqual({ by: "flight", with: "req_1" });
    expect(readShared({ by: "render" })).toEqual({ by: "render" });
  });

  it("leaves out anything not in that shape", () => {
    expect(readShared({ by: "cache", with: "req_1" })).toBeUndefined();
    expect(readShared({ by: "flight", with: 7 })).toEqual({ by: "flight" });
    expect(readShared({ by: "flight", with: undefined })).toEqual({ by: "flight" });
    expect(readShared("flight")).toBeUndefined();
    expect(readShared(null)).toBeUndefined();
    expect(readShared(undefined)).toBeUndefined();
  });
});
