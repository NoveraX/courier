/**
 * HTTP QUERY in Studio: a read that asks with a body. It is written in a
 * colour of its own and offered as a method filter, counted among the reads
 * the catalogue and the audit look at, and copied from the Playground with
 * its body rather than a query string.
 */
import { describe, expect, it } from "vitest";

import { methodChip, methodText } from "@/design/method-color";
import type { ScannedSource } from "@/features/apis/types";
import { detectNPlusOne } from "@/features/audit/rules-patterns";
import { endpointUrl, snippetInput } from "@/features/playground/request-snippet";
import { filterOptions } from "@/features/requests/filter-options";
import { OPEN_FILTER } from "@/features/requests/timeline-filter";
import { buildCatalog } from "@/store/build-catalog";
import { buildCatalogFromRequests } from "@/store/build-catalog-from-requests";
import { requestEntry } from "./request-entry-fixture";

const SEARCH_API: ScannedSource = {
  name: "api",
  baseURL: "http://localhost:7501",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  groups: [
    {
      name: "users",
      prefix: "users",
      filePath: "src/api.ts",
      endpoints: [
        {
          name: "search",
          analysis: {
            hasResponseType: false,
            hasVariablesType: false,
            hasValidation: false,
            httpMethod: "query",
            path: "search",
            type: "query",
          },
        },
      ],
    },
  ],
};

describe("a QUERY in Studio", () => {
  it("is written in its own colour", () => {
    expect(methodText("QUERY")).toBe("text-method-query");
    expect(methodChip("QUERY")).toBe("bg-method-query/13 text-method-query");
  });

  it("is offered as a method filter, with its swatch, before any request is seen", () => {
    const query = filterOptions([], OPEN_FILTER, "method", 500).find((o) => o.value === "QUERY");

    expect(query).toEqual({ value: "QUERY", label: "QUERY", swatch: "query", count: 0 });
  });

  it("is taken for a read when the traffic does not say", () => {
    const catalog = buildCatalogFromRequests([
      requestEntry({ method: "search", httpMethod: "QUERY", type: undefined }),
    ]);

    expect(catalog.api?.groups.users?.endpoints.search?.type).toBe("query");
  });

  it("counts as a read that follows a list in an N+1 pattern", () => {
    const at = (id: string, method: string, startedAt: number, data?: unknown) =>
      requestEntry({
        id,
        method,
        httpMethod: method === "list" ? "GET" : "QUERY",
        type: undefined,
        startedAt,
        timing: { total: 20, middleware: 0, fetch: 20, validation: 0 },
        data,
      });
    const oldestFirst = [
      at("list", "list", 1_000, [{ id: 1 }, { id: 2 }, { id: 3 }]),
      at("d1", "lookup", 1_030),
      at("d2", "lookup", 1_060),
      at("d3", "lookup", 1_090),
    ];

    const items = detectNPlusOne([...oldestFirst].reverse());

    expect(items.map((item) => item.requestIds)).toEqual([["list", "d1", "d2", "d3"]]);
  });

  it("is copied from the Playground with its variables as the body", () => {
    const catalog = buildCatalog([SEARCH_API], []);
    const source = catalog.api;
    const group = source?.groups.users;
    const search = group?.endpoints.search;
    if (source === undefined || group === undefined || search === undefined) {
      throw new Error("The fixture has no users.search");
    }

    const input = snippetInput(endpointUrl(source, group.prefix, search), search, {
      variables: { team: "core" },
      headers: {},
    });

    expect(input).toMatchObject({
      url: "http://localhost:7501/users/search",
      method: "QUERY",
      body: { team: "core" },
    });
  });
});
