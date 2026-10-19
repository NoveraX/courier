/**
 * An endpoint whose path puts a colon before a word, as Google's methods do,
 * shown and copied in the Playground as the call sends it — `::` as one
 * colon, a parameter beside it filled from the variables, an IPv6 host as
 * written — started with the parameters alone as its variables, and its
 * mock route copied at the URL the mock serves it at.
 */
import { describe, expect, it } from "vitest";
import { computeAnalysisStats } from "@/features/apis/helpers";
import type { EndpointAnalysis, ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import { mockRouteUrl } from "@/features/mocks/route-url";
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
  const type = httpMethod === "get" ? "query" : "mutation";
  const analysis = { hasResponseType: false, hasVariablesType: false, hasValidation: false };
  return { name, analysis: { ...analysis, httpMethod, path, type } };
}

const GOOGLE: ScannedSource = {
  name: "api",
  baseURL: "http://[::1]:7501",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  groups: [
    {
      name: "sheets",
      prefix: "v4/spreadsheets",
      filePath: "src/api.ts",
      endpoints: [
        scanned("batchUpdate", "post", ":spreadsheetId::batchUpdate"),
        scanned("inspect", "post", "index::inspect"),
        scanned("status", "get", "operations::status"),
      ],
    },
  ],
};

const catalog = buildCatalog([GOOGLE], []);
const choice = (method: string) => {
  const found = endpointChoicesOf(catalog).find((endpoint) => endpoint.method === method);
  if (found === undefined) throw new Error(`The fixture has no sheets.${method}`);
  return found;
};

describe("the Playground's URL of a path with a colon it sends as written", () => {
  it("shows the colon once, beside the parameter it follows", () => {
    const parts = requestUrlParts(choice("batchUpdate"), { spreadsheetId: "s1", requests: [] });

    expect(parts).toEqual([
      { text: "http://[::1]:7501", kind: "origin" },
      { text: "/v4", kind: "path" },
      { text: "/spreadsheets", kind: "path" },
      { text: "/s1", kind: "param" },
      { text: ":batchUpdate", kind: "path" },
    ]);
  });

  it("marks the parameter missing until the variables give it", () => {
    const parts = requestUrlParts(choice("batchUpdate"), {});

    expect(parts.slice(-2)).toEqual([
      { text: "/:spreadsheetId", kind: "missing" },
      { text: ":batchUpdate", kind: "path" },
    ]);
    expect(requestUrlParts(choice("inspect"), {}).at(-1)).toEqual({
      text: "/index:inspect",
      kind: "path",
    });
  });

  it("is copied as the call sends it, its host untouched and its parameter out of the body", () => {
    const { def, entry, group } = choice("batchUpdate");
    const url = endpointUrl(entry, entry.groups[group]?.prefix ?? "", def);

    expect(
      snippetInput(url, def, { variables: { spreadsheetId: "s1", requests: [] }, headers: {} }),
    ).toEqual({
      url: "http://[::1]:7501/v4/spreadsheets/s1:batchUpdate",
      method: "POST",
      headers: {},
      body: { requests: [] },
    });
  });
});

describe("an endpoint with a colon it sends as written", () => {
  it("starts with its parameters alone as its variables", () => {
    expect(JSON.parse(variablesStubOf(choice("batchUpdate").def, 2))).toEqual({
      spreadsheetId: "",
    });
    expect(variablesStubOf(choice("inspect").def, 2)).toBe("{}");
  });

  it("needs no variables for the colon, a read with none counted out", () => {
    expect(computeAnalysisStats(GOOGLE).variablesType.total).toBe(2);
  });
});

describe("a mock route with a colon it sends as written", () => {
  it("is copied at the URL the mock serves it at, its parameters left to fill", () => {
    expect(mockRouteUrl("http://localhost:7001/", "/v1/urlInspection/index::inspect")).toBe(
      "http://localhost:7001/v1/urlInspection/index:inspect",
    );
    expect(
      mockRouteUrl("http://localhost:7001", "/v4/spreadsheets/:spreadsheetId::batchUpdate"),
    ).toBe("http://localhost:7001/v4/spreadsheets/:spreadsheetId:batchUpdate");
  });
});
