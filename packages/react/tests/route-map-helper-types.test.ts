/**
 * A helper over any API's routes module, typed by `RouteMap`, hands its
 * routes to the React Query caller and key factory: under
 * exactOptionalPropertyTypes, as a project sets it, a map that may name any
 * of the API's endpoints is routes they take.
 */
import type { CourierRoutes, DefinedApi, RouteMap } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { createProxyQueryKeys } from "../src/keys";

describe("routes a helper over any API's routes module is handed", () => {
  it("are taken by the query caller and by the key factory", () => {
    function pageQueries<TApi extends DefinedApi>(routes: CourierRoutes<TApi, RouteMap<TApi>>) {
      return { queries: createProxyQueryCaller(routes), keys: createProxyQueryKeys(routes) };
    }

    expect(pageQueries).toBeTypeOf("function");
  });
});
