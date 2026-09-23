/**
 * Resolving an endpoint's path against its source.
 */
import { describe, expect, it } from "vitest";

import { resolveBasePath } from "../src/utils/url";

describe("an endpoint path that begins with the letters http", () => {
  it("is a path, not an absolute URL", () => {
    expect(resolveBasePath("api", "httpbin/get")).toEqual({ path: "api/httpbin/get" });
  });

  it("is still an absolute URL when it has a scheme", () => {
    expect(resolveBasePath("api", "https://other.example/v2")).toEqual({
      path: "v2",
      baseUrl: "https://other.example",
    });
  });
});
