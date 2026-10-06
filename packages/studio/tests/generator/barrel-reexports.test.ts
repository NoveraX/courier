/**
 * An import's barrel re-exports its schemas and types by name, never with
 * `export *`, which linters reject: every name each schemas module declares,
 * once, a type as a type.
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
      "/pets": { get: { operationId: "listPets", tags: ["pets"], responses: ok(ref("Pet")) } },
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

  it("exports a name two modules declare once, through the first", () => {
    const barrel = barrelOf();
    const store = barrel.match(/^export \{([^}]*)\} from "\.\/store\/schemas";$/m)?.[1] ?? "";

    expect(store).not.toMatch(/\bPetSchema\b/);
  });

  it("re-exports a module of types alone with export type when no validator writes schemas", () => {
    const barrel = barrelOf({ validation: "none" });

    expect(barrel).not.toContain("export *");
    expect(barrel).toMatch(/^export type \{[^}]*\bPet\b[^}]*\} from "\.\/pets\/schemas";$/m);
    expect(barrel).not.toMatch(/\bPetSchema\b/);
    expect(barrel).not.toMatch(/export \{[^}]*\btype /);
  });
});

describe("declaredExports", () => {
  it("reads each declaration the generator writes, a value over a type of the same name", () => {
    const names = declaredExports(
      "export type Pet = { id: string };\nexport const PetSchema = z.object({});\nexport const X: Y = z.lazy(() => s);\nexport type X = { a: 1 };\n  export const Indented = 1;\n",
    );

    expect([...names]).toEqual([
      ["Pet", "type"],
      ["PetSchema", "value"],
      ["X", "value"],
    ]);
  });
});
