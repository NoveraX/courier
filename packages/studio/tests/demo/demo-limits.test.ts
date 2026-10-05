/**
 * A public demo counts what its visitors do in windows of ten seconds, for
 * each page and for every page together, and forgets a page that left.
 */
import { describe, expect, it } from "vitest";

import { createDemoLimits, DEMO_LIMITS, DEMO_WINDOW_MS } from "../../src/server/demo/demo-limits";

const AT = 1_000_000;

function takeMany(
  limits: ReturnType<typeof createDemoLimits>,
  pageId: string,
  times: number,
): Array<string | null> {
  return Array.from({ length: times }, () => limits.take(pageId, "send", AT));
}

describe("the demo's counts", () => {
  it("refuses a page one call past its limit, and says how many it takes", () => {
    const limits = createDemoLimits();

    const taken = takeMany(limits, "page-a", DEMO_LIMITS.send.page + 1);

    expect(taken.slice(0, -1).every((refusal) => refusal === null)).toBe(true);
    expect(taken.at(-1)).toBe(
      "The demo takes up to 10 Playground calls every 10 s from one page. Try again in a moment.",
    );
  });

  it("refuses every page once all of them together reach the limit", () => {
    const limits = createDemoLimits();
    for (let page = 0; page < DEMO_LIMITS.send.all / DEMO_LIMITS.send.page; page++) {
      takeMany(limits, `page-${page}`, DEMO_LIMITS.send.page);
    }

    expect(limits.take("page-new", "send", AT)).toBe(
      "The demo takes up to 60 Playground calls every 10 s from all its visitors. Try again in a moment.",
    );
  });

  it("does not count a call it refused toward everyone's count", () => {
    const limits = createDemoLimits();
    takeMany(limits, "page-a", DEMO_LIMITS.send.page + 5);
    for (let page = 1; page <= 4; page++) takeMany(limits, `page-${page}`, DEMO_LIMITS.send.page);

    const last = takeMany(limits, "page-last", DEMO_LIMITS.send.page);

    expect(last).toEqual(Array.from({ length: DEMO_LIMITS.send.page }, () => null));
  });

  it("starts a page afresh once its window has passed", () => {
    const limits = createDemoLimits();
    takeMany(limits, "page-a", DEMO_LIMITS.send.page);

    expect(limits.take("page-a", "send", AT + DEMO_WINDOW_MS - 1)).not.toBeNull();
    expect(limits.take("page-a", "send", AT + DEMO_WINDOW_MS)).toBeNull();
  });

  it("counts each kind of action apart", () => {
    const limits = createDemoLimits();
    takeMany(limits, "page-a", DEMO_LIMITS.send.page);

    expect(limits.take("page-a", "command", AT)).toBeNull();
    expect(limits.take("page-a", "lifecycle", AT)).toBeNull();
  });

  it("forgets a page that left", () => {
    const limits = createDemoLimits();
    takeMany(limits, "page-a", DEMO_LIMITS.send.page);

    limits.forget("page-a");

    expect(limits.take("page-a", "send", AT)).toBeNull();
  });

  it("counts an action no page is known for once, toward everyone's count", () => {
    const limits = createDemoLimits();

    const taken = Array.from({ length: DEMO_LIMITS.rest.all + 1 }, () =>
      limits.take("*", "rest", AT),
    );

    expect(taken.filter((refusal) => refusal === null)).toHaveLength(DEMO_LIMITS.rest.all);
    expect(taken.at(-1)).toContain("from all its visitors");
  });
});
