/**
 * Where a row that scrolls sideways — the Mocks tabs on a phone, the Store's
 * collections as chips — scrolls to bring its current item to the middle.
 */
import { describe, expect, it } from "vitest";

import { centeredScroll } from "@/screens/mocks/centered-scroll";

describe("a row that scrolls sideways", () => {
  it("scrolls an item past its middle to the middle", () => {
    expect(centeredScroll({ start: 400, width: 80 }, { width: 300, content: 900 })).toBe(290);
  });

  it("stays at its start for an item that sits before its middle", () => {
    expect(centeredScroll({ start: 20, width: 80 }, { width: 300, content: 900 })).toBe(0);
  });

  it("scrolls no further than its end for the last item", () => {
    expect(centeredScroll({ start: 820, width: 80 }, { width: 300, content: 900 })).toBe(600);
  });

  it("does not scroll when it holds no more than it shows", () => {
    expect(centeredScroll({ start: 200, width: 80 }, { width: 300, content: 280 })).toBe(0);
  });

  it("scrolls to whole pixels", () => {
    expect(centeredScroll({ start: 401, width: 81 }, { width: 300, content: 900 })).toBe(292);
  });
});
