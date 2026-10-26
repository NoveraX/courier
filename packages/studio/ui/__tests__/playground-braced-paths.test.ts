/**
 * An endpoint whose path writes a parameter in braces — Google's `{+name}`,
 * whose value keeps its slashes, or a `{id}` that text follows at once —
 * shown and copied in the Playground as the call sends it, a parameter
 * still to fill shown as the path writes it.
 */
import { describe, expect, it } from "vitest";
import type { EndpointAnalysis, ScannedEndpoint, ScannedSource } from "@/features/apis/types";
import { mockRouteUrl } from "@/features/mocks/route-url";
import { endpointChoicesOf } from "@/features/playground/endpoint-choices";
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
  baseURL: "https://api.example.com",
  filePath: "src/api.ts",
  isImported: false,
  hasClient: false,
  groups: [
    {
      name: "operations",
      prefix: "",
      filePath: "src/api.ts",
      endpoints: [
        scanned("cancel", "post", "{+name}::cancel"),
        scanned("file", "get", "files/{id}abc"),
      ],
    },
  ],
};

const catalog = buildCatalog([GOOGLE], []);
const choice = (method: string) => {
  const found = endpointChoicesOf(catalog).find((endpoint) => endpoint.method === method);
  if (found === undefined) throw new Error(`The fixture has no operations.${method}`);
  return found;
};

describe("the Playground's URL of a path with a parameter in braces", () => {
  it("keeps a {+name} value's slashes, each part encoded", () => {
    const parts = requestUrlParts(choice("cancel"), { name: "projects/p 1/operations/o" });

    expect(parts.slice(1)).toEqual([
      { text: "/projects/p%201/operations/o", kind: "param" },
      { text: ":cancel", kind: "path" },
    ]);
  });

  it("shows a parameter still to fill as the path writes it", () => {
    expect(requestUrlParts(choice("file"), {}).slice(1)).toEqual([
      { text: "/files", kind: "path" },
      { text: "/{id}", kind: "missing" },
      { text: "abc", kind: "path" },
    ]);
    expect(requestUrlParts(choice("cancel"), {}).at(1)).toEqual({
      text: "/{+name}",
      kind: "missing",
    });
  });
});

describe("an endpoint with a parameter in braces", () => {
  it("starts with its parameters as its variables, and its mock route keeps them as written", () => {
    expect(JSON.parse(variablesStubOf(choice("cancel").def, 2))).toEqual({ name: "" });
    expect(mockRouteUrl("http://localhost:7001", "/v1/{+name}::cancel")).toBe(
      "http://localhost:7001/v1/{+name}:cancel",
    );
  });
});
