/**
 * Where a row that scrolls sideways goes for one of its items to be in full
 * view: nowhere when it is already, just far enough when it is past an
 * edge, and never before the row's start.
 */
import { describe, expect, it } from "vitest";

import { revealOffset } from "@/screens/settings/reveal-offset";

describe("revealOffset", () => {
  it("stays where it is while the item and the room beside it are in view", () => {
    expect(revealOffset({ scrollLeft: 40, width: 300 }, { left: 100, width: 90 })).toBe(40);
  });

  it("scrolls on just far enough for an item past the end to show with room after it", () => {
    expect(revealOffset({ scrollLeft: 0, width: 300 }, { left: 420, width: 90 })).toBe(226);
  });

  it("scrolls back just far enough for an item before the start to show with room before it", () => {
    expect(revealOffset({ scrollLeft: 226, width: 300 }, { left: 40, width: 90 })).toBe(24);
  });

  it("goes no further back than the row's start for its first item", () => {
    expect(revealOffset({ scrollLeft: 120, width: 300 }, { left: 0, width: 90 })).toBe(0);
  });

  it("keeps the room it is given beside the item", () => {
    expect(revealOffset({ scrollLeft: 0, width: 300 }, { left: 280, width: 40 }, 0)).toBe(20);
    expect(revealOffset({ scrollLeft: 0, width: 300 }, { left: 280, width: 40 }, 8)).toBe(28);
  });
});
