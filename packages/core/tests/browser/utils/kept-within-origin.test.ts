/**
 * A page never keeps a call within its origin itself: the browser follows
 * a redirect, keeping a request's credentials to its own rules, and answers
 * one it was told to leave alone with nothing to read. A page's bundle
 * takes a stand-in that leaves every call's redirects to it, a form's too.
 */
import { describe, expect, it } from "vitest";

import { keptWithinOrigin } from "../../../src/browser/utils/kept-within-origin";

describe("a call kept within its origin, in a page", () => {
  it("leaves its redirects to the browser, whatever it sends", () => {
    const form = new FormData();
    form.append("photo", { uri: "file:///photo.jpg" } as unknown as Blob);

    expect(keptWithinOrigin(fetch, null)).toBeUndefined();
    expect(keptWithinOrigin(fetch, form)).toBeUndefined();
  });
});
