import { describe, expect, it } from "vitest";

import { pathJoin } from "../../src/utils/path-join";

describe("pathJoin", () => {
  it("joins parts with /", () => {
    expect(pathJoin(["users", "list"])).toBe("users/list");
  });

  it("removes duplicate slashes", () => {
    expect(pathJoin(["users/", "/list"])).toBe("users/list");
  });

  it("removes leading slash", () => {
    expect(pathJoin(["/api", "users"])).toBe("api/users");
  });

  it("handles empty parts", () => {
    expect(pathJoin(["", "users"])).toBe("users");
  });

  it("handles single part", () => {
    expect(pathJoin(["users"])).toBe("users");
  });
});
