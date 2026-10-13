/**
 * A schema several groups use is declared once, in the import's own
 * schemas module, and each group imports it from there; one group alone
 * uses keeps beside it. Where each goes is decided over the whole
 * specification, so adding endpoints later finds every schema where the
 * first write put it.
 */
import { afterAll, describe, expect, it } from "vitest";

import { type GenerateOptions, generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { declaredExports } from "../helpers/declared-exports";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

afterAll(() => removeProjects("shared-schemas"));

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});
const get = (operationId: string, tag: string | null, schema: object) => ({
  get: { operationId, ...(tag && { tags: [tag] }), responses: ok(schema) },
});

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/pets": get("listPets", "pets", ref("Pet")),
      "/orders": get("listOrders", "store", ref("Order")),
      "/trees": get("listTrees", "garden", ref("Tree")),
      "/nodes": get("listNodes", "store", ref("Node")),
      "/health": get("health", null, ref("Status")),
      "/status": get("status", "store", ref("Status")),
    },
    components: {
      schemas: {
        Money: { type: "object", properties: { amount: { type: "integer" } } },
        Pet: { type: "object", properties: { price: ref("Money") } },
        Order: { type: "object", properties: { total: ref("Money"), pet: ref("Pet") } },
        Node: { type: "object", properties: { next: ref("Node"), label: { type: "string" } } },
        Tree: { type: "object", properties: { root: ref("Node") } },
        Status: { type: "object", properties: { ok: { type: "boolean" } } },
      },
    },
  }),
);

function files(options: Partial<GenerateOptions> = {}): Record<string, string> {
  return Object.fromEntries(
    generateCode(SPEC, { type: "openapi", outputDir: "src", ...options }, "shop").map((file) => [
      file.path,
      file.content,
    ]),
  );
}

const declared = (text: string | undefined) => [...declaredExports(text ?? "").keys()];

describe("the schemas of an import generated in groups", () => {
  it("are declared once each: in the import's module when several groups use them", () => {
    const written = files();

    expect(declared(written["src/shop/schemas.ts"])).toEqual([
      "Status",
      "StatusSchema",
      "Money",
      "MoneySchema",
      "Pet",
      "PetSchema",
      "Node",
      "NodeSchema",
    ]);
    expect(declared(written["src/shop/store/schemas.ts"])).toEqual(["Order", "OrderSchema"]);
    expect(declared(written["src/shop/garden/schemas.ts"])).toEqual(["Tree", "TreeSchema"]);
    expect(written["src/shop/pets/schemas.ts"]).toBeUndefined();
  });

  it("are imported from the import's module by each group that names one", () => {
    const written = files();

    expect(written["src/shop/store/schemas.ts"]).toContain(
      'import { type Money, MoneySchema, type Pet, PetSchema } from "../schemas";',
    );
    expect(written["src/shop/garden/schemas.ts"]).toContain(
      'import { type Node, NodeSchema } from "../schemas";',
    );
    expect(written["src/shop/pets/index.ts"]).toContain(
      'import { type Pet, PetSchema } from "../schemas";',
    );
  });

  it("are placed over the whole specification, whatever is selected", () => {
    const written = files({ selectedEndpoints: { pets: ["listPets"] } });

    expect(declared(written["src/shop/schemas.ts"])).toEqual([
      "Money",
      "MoneySchema",
      "Pet",
      "PetSchema",
    ]);
    expect(Object.keys(written).filter((path) => path.includes("/store/"))).toEqual([]);
  });

  it("are imported as types alone where no validator writes schemas", () => {
    const written = files({ validation: "none" });

    expect(written["src/shop/store/schemas.ts"]).toContain(
      'import type { Money, Pet } from "../schemas";',
    );
  });

  it.each(["zod", "valibot", "arktype"] as const)(
    "compile, a cycle among them included, as strictly as a project can (%s)",
    (validation) => {
      const generated = generateCode(
        SPEC,
        { type: "openapi", outputDir: "src", validation },
        "shop",
      );
      const dir = writeProject(`shared-schemas/${validation}`, generated);

      expect(
        compileProject(
          dir,
          generated.map((file) => file.path),
          {
            ...STRICT,
            noUnusedLocals: true,
            verbatimModuleSyntax: true,
            exactOptionalPropertyTypes: true,
          },
        ),
      ).toEqual([]);
    },
  );
});

describe("the schemas of many groups sharing one web of schemas", () => {
  it("are declared once, not once a group", () => {
    const web = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `S${i}`,
        { type: "object", properties: { next: ref(`S${(i + 1) % 30}`), n: { type: "string" } } },
      ]),
    );
    const paths = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`/r${i}`, get(`get${i}`, `r${i}`, ref(`S${i % 30}`))]),
    );
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Web", version: "1" },
        paths,
        components: { schemas: web },
      }),
    );

    const generated = generateCode(spec, { type: "openapi", outputDir: "src" }, "web");
    const declarations = generated
      .filter((file) => file.path.endsWith("/schemas.ts"))
      .flatMap((file) => declared(file.content));

    expect(declarations).toHaveLength(60);
    expect(new Set(declarations).size).toBe(60);
  });
});
