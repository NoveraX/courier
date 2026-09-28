/**
 * What the package entry offers. The realtime hooks each group names —
 * `q.chat.useChannel(...)` — ran on hooks exported beside them that took an
 * internal factory first, and option types the entry did not export, so the
 * two described the same options twice and drifted.
 */
import { describe, expect, it } from "vitest";

import * as react from "../src/index";
// @ts-expect-error the untyped hooks' option type is internal
import type { UseComputedQueryOptions } from "../src/index";

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
