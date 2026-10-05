/**
 * The headers a Playground run wrote that its proxy did not pass on: only a
 * proxy's report of what it sent tells which, names compare without case,
 * and a value that is not text was never a header — and the Headers tab
 * lists them on a side of their own, saying how to carry them.
 */
import { describe, expect, it } from "vitest";

import { notForwardedOf } from "@/features/playground/not-forwarded";
import { headerGroupsOf } from "@/features/requests/header-groups";
import { requestEntry } from "./request-entry-fixture";

describe("the headers a proxy did not forward", () => {
  it("are those written as text that the proxy's report leaves out, by name in any case", () => {
    const sent = JSON.stringify({ "x-trace": "abc", "x-shape": { depth: 1 }, accept: "*/*" });

    expect(notForwardedOf(sent, { Accept: "*/*" })).toEqual({ "x-trace": "abc" });
  });

  it("are none when no proxy reported what it sent, or nothing was written", () => {
    expect(notForwardedOf('{ "x-trace": "abc" }', undefined)).toEqual({});
    expect(notForwardedOf("", {})).toEqual({});
    expect(notForwardedOf("{ not json", {})).toEqual({});
    expect(notForwardedOf('["x-trace"]', {})).toEqual({});
  });

  it("read the Headers editor's comments as the editor does", () => {
    const sent = '{\n  // traced by the gateway\n  "x-trace": "abc"\n}';

    expect(notForwardedOf(sent, {})).toEqual({ "x-trace": "abc" });
  });

  it("get a side of their own in the Headers tab, saying how to carry them", () => {
    const groups = headerGroupsOf(requestEntry(), "", { "x-trace": "abc" });

    const dropped = groups.at(-1);
    expect(dropped).toMatchObject({
      key: "dropped",
      title: "Not forwarded by the proxy",
      total: 1,
    });
    expect(dropped?.note).toContain(".headers(…)");
    expect(headerGroupsOf(requestEntry(), "", {}).map((g) => g.key)).toEqual([
      "response",
      "request",
    ]);
  });
});
