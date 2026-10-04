/**
 * What the package entry offers: the callers whose groups name the realtime
 * hooks — `q.chat.useChannel(...)` — and not the untyped hooks they run on,
 * which take an internal factory first; exported beside them, the two would
 * describe the same options twice and drift.
 */
import { describe, expect, it } from "vitest";
import * as react from "../src/index";

describe("the package entry", () => {
  it("keeps the untyped realtime hooks to itself", () => {
    const names = Object.keys(react);

    expect(names).not.toContain("useSubscription");
    expect(names).not.toContain("useChannel");
    expect(names).not.toContain("useComputedQuery");
  });

  it("offers the callers whose groups name the realtime hooks", () => {
    const names = Object.keys(react);

    expect(names).toContain("createQueryCaller");
    expect(names).toContain("createProxyQueryCaller");
    expect(names).toContain("useConnectionStatus");
  });
});
