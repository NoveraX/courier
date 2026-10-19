/**
 * The name a tag or a folder gives its group: its own, or — when it holds
 * nothing a name is spelled with in Latin letters — the last segment every
 * path of the group shares that spells one, never a parameter.
 */
import { describe, expect, it } from "vitest";

import { groupNameOf } from "../../../src/apis/parser/group-name-of";

describe("groupNameOf", () => {
  it("names a group after its tag", () => {
    expect(groupNameOf("Pet Store", ["pets"])).toBe("petStore");
    expect(groupNameOf("Accounts", ["users"])).toBe("accounts");
  });

  it("names a group after the last segment its paths share when the tag spells no name", () => {
    expect(groupNameOf("***", ["api", "users"])).toBe("users");
    expect(groupNameOf("!!!", ["v1", "pet-store"])).toBe("petStore");
  });

  it("passes over a parameter, and a segment that spells no name", () => {
    expect(groupNameOf("+++", ["users", "{id}"])).toBe("users");
    expect(groupNameOf("+++", ["users", ":id"])).toBe("users");
    expect(groupNameOf("+++", ["users", "+++"])).toBe("users");
  });

  it("calls a group that neither its tag nor its paths name `group`", () => {
    expect(groupNameOf("~~~", [])).toBe("group");
    expect(groupNameOf("—", ["{id}", "~~~"])).toBe("group");
  });

  it("keeps the name of a segment from a name the client keeps for itself", () => {
    expect(groupNameOf("***", ["raw"])).toBe("rawGroup");
    expect(groupNameOf("***", ["class"])).toBe("classGroup");
  });
});
