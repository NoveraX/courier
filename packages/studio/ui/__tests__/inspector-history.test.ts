/**
 * When closing the inspector goes back over the history entry its opening
 * added: only on a phone, where it is a page of its own, and only while
 * that entry is the one shown.
 */
import { describe, expect, it } from "vitest";

import { closesByGoingBack } from "@/inspector/inspector-history";

const OPENED = { index: 3, path: "/timeline" };

describe("closesByGoingBack", () => {
  it("goes back on a phone while the entry the opening added shows", () => {
    expect(closesByGoingBack(OPENED, { index: 3, path: "/timeline" }, true)).toBe(true);
  });

  it("closes in place on a wider screen, as the inspector there is a sheet over the page", () => {
    expect(closesByGoingBack(OPENED, { index: 3, path: "/timeline" }, false)).toBe(false);
  });

  it("closes in place an inspector a link opened, which added no entry of its own", () => {
    expect(closesByGoingBack(undefined, { index: 0, path: "/timeline" }, true)).toBe(false);
  });

  it("closes in place once the reader has moved to another entry or page", () => {
    expect(closesByGoingBack(OPENED, { index: 4, path: "/timeline" }, true)).toBe(false);
    expect(closesByGoingBack(OPENED, { index: 3, path: "/waterfall" }, true)).toBe(false);
  });
});
