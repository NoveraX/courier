/**
 * The `mock` a scenario's setup receives, checked by the compiler: typed by
 * the source named as the type argument, whether that source has groups or
 * not, and open to any name when none is named.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { describe, expectTypeOf, it } from "vitest";

import { defineScenario } from "../src";

const { endpoint } = courier();
const flatApi = defineApi({
  baseURL: "https://api.example",
  endpoints: { listUsers: endpoint.get("users").response<Array<{ id: number }>>() },
});

describe("defineScenario", () => {
  it("takes a source without groups", () => {
    defineScenario<typeof flatApi>("flat", (mock) => {
      expectTypeOf(mock("users", "listUsers").resolves).parameter(0).toEqualTypeOf<Array<{ id: number }>>();
      // @ts-expect-error "listPosts" is not an endpoint of the source
      mock("users", "listPosts");
    });
  });

  it("accepts any name when no source is named", () => {
    defineScenario("open", (mock) => {
      expectTypeOf(mock("anything", "at-all").resolves).parameter(0).toEqualTypeOf<unknown>();
    });
  });
});
