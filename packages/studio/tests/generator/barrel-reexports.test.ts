/**
 * An import's barrel re-exports its schemas and types by name, never with
 * `export *`, which linters reject: every name each schemas module declares,
 * once, a type as a type. A schema two groups use is declared once, in the
 * import's own module.
 */
import { describe, expect, it } from "vitest";
import { generateCode } from "../../src/apis/generator";
import { declaredExports } from "../../src/apis/generator/declared-exports";
import { parseSpec } from "../../src/apis/parser";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema: object) => ({
  "200": { description: "ok", content: { "application/json": { schema } } },
});

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: ok(ref("Pet")) },
        post: {
          operationId: "createPet",
          tags: ["pets"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
          responses: ok(ref("Pet")),
        },
      },
      "/pets/{id}": {
        get: {
          operationId: "getPet",
          tags: ["pets"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", minLength: 3 } },
          ],
          responses: ok(ref("Pet")),
        },
      },
      "/orders": {
        get: { operationId: "listOrders", tags: ["store"], responses: ok(ref("Order")) },
      },
    },
    components: {
      schemas: {
        Pet: { type: "object", properties: { id: { type: "string" } } },
        Order: { type: "object", properties: { pet: ref("Pet") } },
      },
    },
  }),
);

function barrelOf(options: Record<string, unknown> = {}): string {
  const files = generateCode(SPEC, { type: "openapi", outputDir: "src", ...options }, "shop");
  return files.find((file) => file.path === "src/shop/index.ts")?.content ?? "";
}

describe("the barrel of an import", () => {
  it("re-exports by name, a type as a type, and never a whole module", () => {
    const barrel = barrelOf();

    expect(barrel).not.toContain("export *");
    expect(barrel).toContain("export { type Pet, PetSchema");
    expect(barrel).toMatch(
      /^export \{[^}]*\btype Order\b[^}]*\bOrderSchema\b[^}]*\} from "\.\/store\/schemas";$/m,
    );
  });

  it("re-exports what each schemas module declares, the extracted parameters too", () => {
    const files = generateCode(SPEC, { type: "openapi", outputDir: "src" }, "shop");
    const barrel = files.find((file) => file.path === "src/shop/index.ts")?.content ?? "";
    const declared = files
      .filter((file) => file.path.endsWith("/schemas.ts"))
      .flatMap((file) => [...declaredExports(file.content).keys()]);

    expect(declared.length).toBeGreaterThan(4);
    for (const name of new Set(declared)) {
      expect(barrel).toMatch(new RegExp(`[{,\\s](type )?${name}[,\\s}]`));
    }
  });

  it("declares a schema two groups use once, in the import's own module, which each imports", () => {
    const files = generateCode(SPEC, { type: "openapi", outputDir: "src" }, "shop");
    const text = (path: string) => files.find((file) => file.path === path)?.content ?? "";
    const barrel = barrelOf();

    expect(declaredExports(text("src/shop/schemas.ts")).has("PetSchema")).toBe(true);
    expect(declaredExports(text("src/shop/pets/schemas.ts")).has("PetSchema")).toBe(false);
    expect(declaredExports(text("src/shop/store/schemas.ts")).has("PetSchema")).toBe(false);
    expect(text("src/shop/store/schemas.ts")).toContain(
      'import { type Pet, PetSchema } from "../schemas";',
    );
    expect(text("src/shop/pets/index.ts")).toContain(
      'import { type Pet, PetSchema } from "../schemas";',
    );
    expect(barrel).toContain('export { type Pet, PetSchema } from "./schemas";');
    expect(barrel.match(/\bPetSchema\b/g)).toHaveLength(1);
  });

  it("re-exports a module of types alone with export type when no validator writes schemas", () => {
    const barrel = barrelOf({ validation: "none" });

    expect(barrel).not.toContain("export *");
    expect(barrel).toMatch(/^export type \{[^}]*\bPet\b[^}]*\} from "\.\/schemas";$/m);
    expect(barrel).not.toMatch(/\bPetSchema\b/);
    expect(barrel).not.toMatch(/export \{[^}]*\btype /);
  });
});

describe("declaredExports", () => {
  it("reads each declaration the generator writes, a value over a type of the same name", () => {
    const names = declaredExports(
      "export type Pet = { id: string };\nexport const PetSchema = z.object({});\nexport const X: Y = z.lazy(() => s);\nexport type X = { a: 1 };\n",
    );

    expect([...names]).toEqual([
      ["Pet", "type"],
      ["PetSchema", "value"],
      ["X", "value"],
    ]);
  });

  it("reads nothing a doc comment holds, however its lines read", () => {
    const names = declaredExports(
      [
        "/**",
        "export const Fake = defineGroup({",
        "export type AlsoFake = 1;",
        " */",
        "export type Pet = { id: string };",
      ].join("\n"),
    );

    expect([...names]).toEqual([["Pet", "type"]]);
  });
});
