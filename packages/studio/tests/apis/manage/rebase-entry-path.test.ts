/**
 * An endpoint moved under another prefix has its path written again,
 * relative to the new prefix. The path is read back out of generated code,
 * where the generator wrote what would end a page's `<script>` as escapes:
 * written again, it is escaped the same, and calls the same URL.
 */
import { describe, expect, it } from "vitest";

import { entryUrl, rebaseEntryPath } from "../../../src/apis/manage/rebase-entry-path";

describe("a path written again under another prefix", () => {
  it("is escaped as the generator escapes it, and calls the same URL", () => {
    const entry = 'getCustomer: endpoint.get("\\u003cb\\u003e/:id")';

    const rebased = rebaseEntryPath(entry, ["endpoint"], "/v1/customers", "/v1");

    expect(rebased).toBe('getCustomer: endpoint.get("customers/\\u003cb\\u003e/:id")');
    expect(entryUrl(rebased ?? "", ["endpoint"], "/v1")).toBe(
      entryUrl(entry, ["endpoint"], "/v1/customers"),
    );
  });
});
