/**
 * A query an endpoint's path writes, shown and counted in Studio as the call
 * sends it: as text after the path, with no `:name` in it read as a
 * parameter the variables must fill.
 */
import { describe, expect, it } from "vitest";
import { computeAnalysisStats } from "@/features/apis/helpers";
import type { EndpointAnalysis, ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import { endpointChoicesOf } from "@/features/playground/endpoint-choices";
import { endpointUrl, snippetInput } from "@/features/playground/request-snippet";
import { requestUrlParts } from "@/features/playground/request-url";
import { variablesStubOf } from "@/features/playground/variables-stub";
import { buildCatalog } from "@/store/build-catalog";

function scanned(
  name: string,
  httpMethod: EndpointAnalysis["httpMethod"],
  path: string,
): ScannedEndpoint {
  const analysis = { hasResponseType: false, hasVariablesType: false, hasValidation: false };
  return { name, analysis: { ...analysis, httpMethod, path, type: "query" } };
}

const SHOP: ScannedSource = {
  name: "api",
  baseURL: "http://localhost:7501",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  groups: [
    {
      name: "items",
      prefix: "items",
      filePath: "src/api.ts",
      endpoints: [
        scanned("sorted", "get", "?sort=:field"),
        scanned("byId", "get", ":id?expand=:what"),
        scanned("next", "get", "go?to=/a/:b"),
      ],
    },
  ],
};

const choice = (method: string) => {
  const found = endpointChoicesOf(buildCatalog([SHOP], [])).find((e) => e.method === method);
  if (found === undefined) throw new Error(`The fixture has no items.${method}`);
  return found;
};

describe("a query an endpoint's path writes", () => {
  it("is shown after the path as written, beside the parameter it follows", () => {
    expect(
      requestUrlParts(choice("byId"), { id: 7 }).map((part) => [part.text, part.kind]),
    ).toEqual([
      ["http://localhost:7501", "origin"],
      ["/items", "path"],
      ["/7", "param"],
      ["?expand=:what", "path"],
    ]);
  });

  it("reads no parameter in it, a slash in its value or not", () => {
    expect(requestUrlParts(choice("next"), {}).map((part) => part.text)).toEqual([
      "http://localhost:7501",
      "/items",
      "/go",
      "?to=/a/:b",
    ]);
  });

  it("is followed by a read's variables after `&`, in the URL shown and copied", () => {
    const { def, entry, group } = choice("byId");

    expect(requestUrlParts(choice("byId"), { id: 7, page: 2 }).at(-1)).toEqual({
      text: "&page=2",
      kind: "query",
    });
    expect(
      snippetInput(endpointUrl(entry, entry.groups[group]?.prefix ?? "", def), def, {
        variables: { id: 7, page: 2 },
        headers: {},
      }).url,
    ).toBe("http://localhost:7501/items/7?expand=:what&page=2");
  });

  it("asks the variables for nothing, and needs none", () => {
    expect(variablesStubOf(choice("sorted").def, 2)).toBe("{}");
    expect(JSON.parse(variablesStubOf(choice("byId").def, 2))).toEqual({ id: "" });
    expect(computeAnalysisStats(SHOP).variablesType.total).toBe(1);
  });
});
