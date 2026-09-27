/**
 * Endpoints and schemas are looked up by name in records, and a name that
 * `Object.prototype` also has — valueOf, constructor, toString — is a name
 * like any other: an update keeps the endpoints the user wrote under such
 * names, and the generator writes schemas named so.
 */
import { describe, expect, it } from "vitest";

import { generateCode } from "../src/apis/generator";
import { classifyEndpoints, generateFingerprints } from "../src/apis/merge/fingerprint";
import { previewUpdate } from "../src/apis/merge/update-flow";
import { parseSpec } from "../src/apis/parser";

const GENERATED = [
  'import { courier, defineGroup } from "@noverax/courier/define";',
  "",
  "const { endpoint } = courier();",
  "",
  "export const users = defineGroup({",
  '  prefix: "/users",',
  "  endpoints: {",
  '    getAll: endpoint.get(""),',
  "  },",
  "});",
  "",
].join("\n");

describe("an endpoint the user wrote under a name Object.prototype has", () => {
  it("is classified as the user's, like any other name", () => {
    const { endpoints } = classifyEndpoints(
      { valueOf: '    valueOf: endpoint.get("mine"),', myOwn: '    myOwn: endpoint.get("own"),' },
      {},
      [],
    );

    expect(endpoints).toEqual({ valueOf: "modified", myOwn: "modified" });
  });

  it("survives an update", () => {
    const onDisk = GENERATED.replace(
      '    getAll: endpoint.get(""),',
      '    getAll: endpoint.get(""),\n    constructor: endpoint.get("mine/ctor"),\n    toString: endpoint.get("mine/str"),',
    );
    const path = "src/api/shop/users/index.ts";

    const merged = previewUpdate(generateFingerprints(GENERATED), [{ path, content: GENERATED }], { [path]: onDisk });

    expect(merged.files[0]?.content).toContain('constructor: endpoint.get("mine/ctor")');
    expect(merged.files[0]?.content).toContain('toString: endpoint.get("mine/str")');
  });
});

describe("a schema named like an Object.prototype member", () => {
  it("is generated like any other", () => {
    const ok = (name: string) => ({
      "200": { description: "ok", content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } } },
    });
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Shop", version: "1" },
        paths: { "/a": { get: { operationId: "getA", tags: ["a"], responses: ok("constructor") } } },
        components: { schemas: { constructor: { type: "object", properties: { id: { type: "string" } } } } },
      }),
    );

    const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "shop");

    expect(files.map((file) => file.content).join("\n")).toMatch(/export const \w*[Cc]onstructor\w*Schema/);
  });
});

describe("an update that gives a group another prefix", () => {
  const group = (prefix: string, endpoints: string[]) =>
    [
      'import { courier, defineGroup } from "@noverax/courier/define";',
      "",
      "const { endpoint } = courier();",
      "",
      "export const customers = defineGroup({",
      `  prefix: ${JSON.stringify(prefix)},`,
      "  endpoints: {",
      ...endpoints.map((line) => `    ${line},`),
      "  },",
      "});",
      "",
    ].join("\n");
  const path = "src/api/shop/customers/index.ts";
  const WRITTEN = group("/v1/customers", ['listCustomers: endpoint.get("")', 'getCustomer: endpoint.get(":id")']);

  it("keeps every endpoint the user edited or added at the URL it called", () => {
    const onDisk = group("/v1/customers", [
      'listCustomers: endpoint.get("")',
      'getCustomer: endpoint.get(":id").with({ timeout: 1 })',
      'searchCustomers: endpoint.get("search")',
    ]);
    const next = group("/v1", [
      'listCustomers: endpoint.get("customers")',
      'getCustomer: endpoint.get("customers/:id")',
      'listCharges: endpoint.get("charges")',
    ]);

    const merged = previewUpdate(generateFingerprints(WRITTEN), [{ path, content: next }], { [path]: onDisk }).files[0]?.content ?? "";

    expect(merged).toContain('prefix: "/v1",');
    expect(merged).toContain('getCustomer: endpoint.get("customers/:id").with({ timeout: 1 })');
    expect(merged).toContain('searchCustomers: endpoint.get("customers/search")');
    expect(merged).toContain('listCharges: endpoint.get("charges")');
  });

  it("widens the prefix to what both share when the user's endpoints are not under the new one", () => {
    const onDisk = group("/v2/customers", ['listCustomers: endpoint.get("")', 'searchCustomers: endpoint.get("search")']);
    const next = group("/v1/customers", ['listCustomers: endpoint.get("")', 'getCustomer: endpoint.get(":id")']);

    const merged = previewUpdate(generateFingerprints(WRITTEN), [{ path, content: next }], { [path]: onDisk }).files[0]?.content ?? "";

    expect(merged).toContain('prefix: "/",');
    expect(merged).toContain('searchCustomers: endpoint.get("v2/customers/search")');
    expect(merged).toContain('getCustomer: endpoint.get("v1/customers/:id")');
  });
});
