import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";

/** The caller may omit `limit`; the closure always sees one. */
const SearchQuery = z.object({ q: z.string(), limit: z.number().default(20) });

const { query } = courier();
let seen: unknown;

const api = defineApi({
  name: "api",
  baseURL: "https://example.com",
  groups: {
    search: defineGroup({
      prefix: "/search",
      endpoints: {
        run: query.variables(SearchQuery).via((http, vars) => {
          seen = vars;
          return http.get("", vars);
        }),
      },
    }),
  },
});

/**
 * A schema may accept less than it produces. The caller satisfies its input;
 * the closure receives its output. Demanding the output from the caller would
 * make every defaulted field mandatory at the call site.
 */
describe("a variables schema whose input and output differ", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    seen = undefined;
  });

  it("lets the caller omit what the schema defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("{}", { headers: { "content-type": "application/json" } }),
        ),
      ),
    );

    await createCaller(api).search.run({ q: "boots" });

    expect(seen).toEqual({ q: "boots", limit: 20 });
  });

  it("still refuses what the schema cannot accept", () => {
    function refused(): void {
      // @ts-expect-error — q is required by the schema's input
      createCaller(api).search.run({ limit: 5 });
      // @ts-expect-error — q is a string
      createCaller(api).search.run({ q: 1 });
    }

    expect(refused).toBeTypeOf("function");
  });
});
