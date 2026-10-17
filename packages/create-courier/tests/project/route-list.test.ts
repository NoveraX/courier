import { describe, expect, it } from "vitest";

import { routeList } from "../../src/project/route-list";

describe("routeList", () => {
  it("reads each module however its path is written, and each route's URL path", () => {
    const list = routeList(`import { index, route } from "@react-router/dev/routes";

export default [
  index("./routes/home.tsx"),
  route("/api/request/", "./routes/api.request.ts"),
  // route("courier", "routes/courier.tsx"),
];
`);

    expect([...(list?.modules ?? [])]).toEqual(
      expect.arrayContaining(["routes/home", "routes/api.request"]),
    );
    expect(list?.modules.has("routes/courier")).toBe(false);
    expect([...(list?.paths ?? [])]).toEqual(["api/request"]);
    expect(list?.fromFolder).toBe(false);
  });
});
