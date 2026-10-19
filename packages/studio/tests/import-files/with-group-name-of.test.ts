/**
 * The file a renamed group was written to is merged under the name the
 * group has now: merged as it was, the group kept its old name, and the
 * source that imports it by the new one did not compile.
 */
import { describe, expect, it } from "vitest";

import { withGroupNameOf } from "../../src/server/import-files/with-group-name-of";

describe("withGroupNameOf", () => {
  it("declares the group under the name the other file declares its group by", () => {
    const old = 'export const group = defineGroup({\n  prefix: "/users",\n});\n';

    expect(withGroupNameOf(old, "export const users = defineGroup({")).toBe(
      'export const users = defineGroup({\n  prefix: "/users",\n});\n',
    );
  });

  it("keeps a type the declaration gives its binding", () => {
    expect(
      withGroupNameOf(
        "export const group: Group = defineGroup({",
        "export const users = defineGroup({",
      ),
    ).toBe("export const users: Group = defineGroup({");
  });

  it("leaves a file that declares no group, or beside one that declares none, as it is", () => {
    expect(
      withGroupNameOf("export const shop = defineApi({", "export const users = defineGroup({"),
    ).toBe("export const shop = defineApi({");
    expect(withGroupNameOf("export const group = defineGroup({", "export {};")).toBe(
      "export const group = defineGroup({",
    );
  });

  it("writes a name holding $ as it is", () => {
    expect(
      withGroupNameOf("export const group = defineGroup({", "export const $users = defineGroup({"),
    ).toBe("export const $users = defineGroup({");
  });
});
