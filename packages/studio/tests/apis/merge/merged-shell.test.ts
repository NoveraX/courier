/**
 * A merge writes the prefix the merged group declares into its declaration.
 * The prefix is read back out of generated code, where the generator wrote
 * what would end a page's `<script>` as escapes: written back, it is
 * escaped the same, and reads back as the same prefix.
 */
import { describe, expect, it } from "vitest";

import { readLayout } from "../../../src/apis/merge/declaration-layout";
import { mergedShell } from "../../../src/apis/merge/merged-shell";

function group(prefix: string): string {
  return `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const things = defineGroup({
  prefix: ${prefix},
  endpoints: {
    listThings: endpoint.get(""),
  },
});
`;
}

describe("the prefix a merge writes", () => {
  it("is escaped as the generator escapes it, and reads back the same", () => {
    const own = readLayout(group('"/things"'), "things");
    const fresh = readLayout(group('"/things"'), "things");
    if (!own || !fresh) throw new Error("the group has no layout");

    const shell = mergedShell(own, fresh, "/things</script>\u2028");
    const line = shell?.header.find((text) => text.trim().startsWith("prefix:"));

    expect(line).toBe('  prefix: "/things\\u003c/script\\u003e\\u2028",');
    expect(JSON.parse(line?.trim().slice("prefix: ".length, -1) ?? "null")).toBe(
      "/things</script>\u2028",
    );
  });
});
