/**
 * A specification is generated from only when every value the generator
 * writes into the code as it stands is of a kind that can only be what it
 * says — names that are ASCII identifiers and no word the code keeps for
 * itself, types a schema has, methods Studio supports, finite numbers,
 * flags, patterns whose literal ends where they do — and every name the
 * generated client is called by is one it can be called by. One sent back
 * to Studio, crafted, had a name written into the project's code as it
 * came. A specification Studio parses passes, however deep it nests.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { assertGeneratable } from "../../src/apis/generator/generatable-spec";
import { parseSpec } from "../../src/apis/parser";
import { InvalidSpecError } from "../../src/apis/parser/invalid-spec-error";
import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSpec,
} from "../../src/apis/parser/types";

const INJECTED = "Node = 1 as never; globalThis.pwned = 1; export const Evil";

function endpoint(): ParsedEndpoint {
  return {
    name: "list",
    operationId: "list",
    httpMethod: "post",
    path: "",
    fullPath: "/pets",
    description: "",
    secured: false,
    requestBody: { name: "ListBody", type: "ref", refName: "Owner" },
    requestBodyMediaType: "multipart/form-data",
    requestBodyEncoding: { tags: { style: "form", explode: true } },
    parameters: [
      {
        name: "filter",
        in: "query",
        required: false,
        type: "object",
        description: "",
        encoding: { style: "deepObject", explode: true },
        schema: { name: "Filter", type: "ref", refName: "Owner" },
        constraints: { minLength: 1 },
      },
      {
        name: "kinds",
        in: "query",
        required: false,
        type: "array",
        description: "",
        items: { name: "kind", type: "string" },
      },
    ],
    responseSchema: {
      name: "Pets",
      type: "array",
      items: { name: "Pet", type: "ref", refName: "Pet" },
    },
    tags: ["pets"],
  };
}

function spec(): ParsedSpec {
  return {
    title: "Shop",
    version: "1",
    description: "",
    baseURL: "https://shop.example",
    format: "openapi3",
    groups: [{ name: "pets", description: "", prefix: "/pets", endpoints: [endpoint()] }],
    schemas: {
      Pet: {
        name: "Pet",
        type: "object",
        properties: {
          owner: { type: "ref", refName: "Owner", required: false },
          tags: {
            type: "array",
            required: false,
            items: { name: "tag", type: "string", constraints: { maxLength: 20 } },
          },
          kind: {
            type: "union",
            required: false,
            shape: {
              name: "kind",
              type: "union",
              variants: [{ name: "o", type: "ref", refName: "Owner" }],
            },
          },
          extra: {
            type: "object",
            required: false,
            valueType: { name: "extra", type: "ref", refName: "Owner" },
          },
          code: {
            type: "string",
            required: false,
            constraints: { pattern: { source: "^[a-z]+$", unicode: true }, minimum: 0 },
          },
        },
      },
      Labels: {
        name: "Labels",
        type: "object",
        valueType: { name: "label", type: "ref", refName: "Owner" },
      },
      Owner: { name: "Owner", type: "object", properties: {} },
    },
    securitySchemes: [],
    skipped: [],
  };
}

type Crafted = ParsedSpec & Record<string, unknown>;

/* The refusal the change makes of the specification, or `null` when it passes. */
function refusalOf(change: (crafted: Crafted) => void): InvalidSpecError | null {
  const crafted = structuredClone(spec()) as Crafted;
  change(crafted);
  try {
    assertGeneratable(crafted);
  } catch (error) {
    if (error instanceof InvalidSpecError) return error;
    throw error;
  }
  return null;
}

/* The field the specification is refused at, once the change is made to it. */
function refusedAt(change: (crafted: Crafted) => void): string {
  return refusalOf(change)?.field ?? "nothing refused";
}

/* A value set where the parser never puts one, whatever the type says. */
function set(target: object, key: string, value: unknown): void {
  Reflect.set(target, key, value);
}

/* A key of the object's own, as JSON gives one: `__proto__` included, which an assignment would take for the prototype. */
function own(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

const pet = (c: ParsedSpec) => c.schemas.Pet?.properties ?? {};
const first = (c: ParsedSpec) => c.groups[0]?.endpoints[0] as ParsedEndpoint;
const codeChecks = (c: ParsedSpec) => pet(c).code?.constraints ?? {};

describe("assertGeneratable", () => {
  it("passes a specification of the shapes Studio's parser gives, and it generates", () => {
    expect(() => assertGeneratable(spec())).not.toThrow();
    expect(
      generateCode(spec(), { type: "openapi", outputDir: "src/api" }, "shop").length,
    ).toBeGreaterThan(0);
  });

  it("refuses a name written as code that is not an identifier, wherever it is", () => {
    expect(
      refusedAt((crafted) => {
        crafted.schemas[INJECTED] = spec().schemas.Owner as ParsedSchema;
      }),
    ).toBe("schemas");
    expect(refusedAt((c) => set(pet(c).owner ?? {}, "refName", INJECTED))).toBe(
      "schemas.Pet.properties.owner.refName",
    );
    expect(
      refusedAt((c) => set(pet(c).kind?.shape?.variants?.[0] ?? {}, "refName", INJECTED)),
    ).toBe("schemas.Pet.properties.kind.shape.variants[0].refName");
    expect(refusedAt((c) => set(pet(c).extra?.valueType ?? {}, "refName", INJECTED))).toBe(
      "schemas.Pet.properties.extra.valueType.refName",
    );
    expect(refusedAt((c) => set(c.schemas.Labels?.valueType ?? {}, "refName", INJECTED))).toBe(
      "schemas.Labels.valueType.refName",
    );
    expect(refusedAt((c) => set(first(c).requestBody ?? {}, "refName", INJECTED))).toBe(
      "groups[0].endpoints[0].requestBody.refName",
    );
    expect(refusedAt((c) => set(first(c).responseSchema?.items ?? {}, "refName", INJECTED))).toBe(
      "groups[0].endpoints[0].responseSchema.items.refName",
    );
    expect(refusedAt((c) => set(first(c).parameters[0]?.schema ?? {}, "refName", INJECTED))).toBe(
      "groups[0].endpoints[0].parameters[0].schema.refName",
    );
    expect(refusedAt((c) => set(first(c).parameters[1]?.items ?? {}, "refName", INJECTED))).toBe(
      "groups[0].endpoints[0].parameters[1].items.refName",
    );
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "name", INJECTED))).toBe("groups[0].name");
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "parent", INJECTED))).toBe("groups[0].parent");
    expect(refusalOf((c) => set(c.groups[0] ?? {}, "parent", INJECTED))?.message).toContain(
      "is refused: a name the code is written with is an identifier",
    );
  });

  it("refuses a name JavaScript or the generated files keep for themselves", () => {
    expect(refusalOf((c) => set(c.groups[0] ?? {}, "name", "default"))?.message).toContain(
      "it is a word the generated code keeps for itself",
    );
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "name", "z"))).toBe("groups[0].name");
    expect(refusedAt((c) => set(pet(c).owner ?? {}, "refName", "class"))).toBe(
      "schemas.Pet.properties.owner.refName",
    );
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "name", "raw"))).toBe("groups[0].name");
    expect(refusedAt((c) => own(c.schemas, "string", spec().schemas.Owner))).toBe("schemas");
    expect(refusedAt((c) => set(pet(c).owner ?? {}, "refName", "number"))).toBe(
      "schemas.Pet.properties.owner.refName",
    );
  });

  it("refuses __proto__, which an object literal takes for its prototype", () => {
    expect(refusalOf((c) => own(c.schemas, "__proto__", spec().schemas.Owner))?.message).toContain(
      "an object literal would take it for its prototype",
    );
    expect(refusedAt((c) => own(c.groups[0] ?? {}, "name", "__proto__"))).toBe("groups[0].name");
  });

  it("refuses a name of another script, which the generated files cannot carry", () => {
    expect(refusedAt((c) => own(c.schemas, "Счёт", spec().schemas.Owner))).toBe("schemas");
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "name", "питомцы"))).toBe("groups[0].name");
  });

  it("takes a schema named like a value the generated code reads, which a type alias leaves alone", () => {
    expect(
      refusedAt((c) => {
        own(c.schemas, "Error", spec().schemas.Owner);
        own(c.schemas, "$Pet", spec().schemas.Owner);
        set(pet(c).owner ?? {}, "refName", "Error");
      }),
    ).toBe("nothing refused");
  });

  it("refuses a schema's type the parser never gives, which a type alias writes as code", () => {
    expect(refusedAt((c) => set(c.schemas.Owner ?? {}, "type", "string; run()"))).toBe(
      "schemas.Owner.type",
    );
  });

  it("refuses a method Studio does not support, which names the client's call", () => {
    expect(refusedAt((c) => set(first(c), "httpMethod", "get(run()); endpoint.get"))).toBe(
      "groups[0].endpoints[0].httpMethod",
    );
    expect(refusedAt((c) => set(first(c), "httpMethod", "POST"))).toBe(
      "groups[0].endpoints[0].httpMethod",
    );
  });

  it.each([
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
  ])("refuses a %s that is not a finite number, which is written as it stands", (key) => {
    expect(refusedAt((c) => set(codeChecks(c), key, "1).refine(() => run())"))).toBe(
      `schemas.Pet.properties.code.constraints.${key}`,
    );
    expect(refusedAt((c) => set(codeChecks(c), key, null))).toBe(
      `schemas.Pet.properties.code.constraints.${key}`,
    );
    expect(refusedAt((c) => set(codeChecks(c), key, Number.NaN))).toBe(
      `schemas.Pet.properties.code.constraints.${key}`,
    );
    expect(refusedAt((c) => set(codeChecks(c), key, Number.POSITIVE_INFINITY))).toBe(
      `schemas.Pet.properties.code.constraints.${key}`,
    );
    expect(refusedAt((c) => set(first(c).parameters[0]?.constraints ?? {}, key, "1)"))).toBe(
      `groups[0].endpoints[0].parameters[0].constraints.${key}`,
    );
    expect(refusedAt((c) => set(codeChecks(c), key, -1.5))).toBe("nothing refused");
  });

  it("takes whether a value is whole as given, since it is only ever tested", () => {
    expect(refusedAt((c) => set(codeChecks(c), "integer", "run()"))).toBe("nothing refused");
  });

  it("refuses a pattern whose literal would not end where the pattern does", () => {
    const pattern = (source: unknown) => (c: Crafted) =>
      set(codeChecks(c), "pattern", { source, unicode: false });

    expect(refusedAt(pattern("[/"))).toBe("schemas.Pet.properties.code.constraints.pattern.source");
    expect(refusedAt(pattern("a\\"))).toBe(
      "schemas.Pet.properties.code.constraints.pattern.source",
    );
    expect(refusedAt(pattern("*/ run(); /"))).toBe(
      "schemas.Pet.properties.code.constraints.pattern.source",
    );
    expect(refusedAt(pattern(5))).toBe("schemas.Pet.properties.code.constraints.pattern.source");
    expect(refusedAt((c) => set(codeChecks(c), "pattern", "^a$"))).toBe(
      "schemas.Pet.properties.code.constraints.pattern",
    );
  });

  it("takes a pattern that closes as written, its flag and whether it compiles aside", () => {
    expect(refusedAt((c) => set(codeChecks(c), "pattern", { source: "^a/[/]\\\\$" }))).toBe(
      "nothing refused",
    );
    expect(refusedAt((c) => set(codeChecks(c), "pattern", { source: "(", unicode: "u" }))).toBe(
      "nothing refused",
    );
  });

  it("refuses an explode that is not a flag", () => {
    expect(refusedAt((c) => set(first(c).parameters[0]?.encoding ?? {}, "explode", "run()"))).toBe(
      "groups[0].endpoints[0].parameters[0].encoding.explode",
    );
    expect(refusedAt((c) => set(first(c).requestBodyEncoding?.tags ?? {}, "explode", null))).toBe(
      "groups[0].endpoints[0].requestBodyEncoding.tags.explode",
    );
  });

  it("refuses an endpoint its client could not be called by", () => {
    const named = (name: unknown) => (c: Crafted) => set(first(c), "name", name);

    for (const name of ["options", "raw", "with", "__proto__", "pets.list", "", ["list"]]) {
      expect(refusedAt(named(name))).toBe("groups[0].endpoints[0].name");
    }
    expect(
      refusedAt((c) => c.groups[0]?.endpoints.push({ ...first(c), httpMethod: "delete" })),
    ).toBe("groups[0].endpoints[1].name");
  });

  it("refuses a parameter whose name is no string, or that is sent nowhere it can be", () => {
    const parameter = (c: Crafted) => first(c).parameters[1] ?? {};

    expect(refusedAt((c) => set(parameter(c), "name", ["undefined"]))).toBe(
      "groups[0].endpoints[0].parameters[1].name",
    );
    expect(refusedAt((c) => set(parameter(c), "in", "body"))).toBe(
      "groups[0].endpoints[0].parameters[1].in",
    );
  });

  it("refuses a group named as another, and a parent that names no group", () => {
    expect(
      refusedAt((c) => c.groups.push({ ...(c.groups[0] as ParsedGroup), endpoints: [] })),
    ).toBe("groups[1].name");
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "parent", "ghost"))).toBe("groups[0].parent");
  });

  it("refuses two groups written to one folder, as a Windows device name and its escape are", () => {
    for (const device of ["con", "aux", "nul", "com1"]) {
      const group = (name: string): ParsedGroup => ({
        name,
        description: "",
        prefix: "/",
        endpoints: [],
      });
      const refusal = refusalOf((c) => c.groups.push(group(device), group(`_${device}`)));

      expect(refusal?.field).toBe(`groups[${spec().groups.length + 1}].name`);
      expect(refusal?.message).toContain(
        `is refused: another group, "${device}", is written to the same folder, "_${device}"`,
      );
    }
  });

  it("takes a group named as a device's folder when no group takes the device's name", () => {
    expect(
      refusalOf((c) =>
        c.groups.push({ name: "_con", description: "", prefix: "/", endpoints: [] }),
      ),
    ).toBeNull();
  });

  it("refuses a chain of parents that loops, which nothing would be generated in", () => {
    expect(refusalOf((c) => set(c.groups[0] ?? {}, "parent", "pets"))?.message).toContain(
      "is refused: its chain of parents loops",
    );
    expect(
      refusedAt((c) => {
        c.groups.push({
          name: "kinds",
          description: "",
          prefix: "/kinds",
          endpoints: [],
          parent: "pets",
        });
        set(c.groups[0] ?? {}, "parent", "kinds");
      }),
    ).toBe("groups[0].parent");
  });

  it("refuses a node that is not an object, and takes one left out or null as absent", () => {
    expect(refusedAt((c) => set(pet(c), "a", null))).toBe("schemas.Pet.properties.a");
    expect(refusedAt((c) => set(pet(c).kind?.shape ?? {}, "variants", [null]))).toBe(
      "schemas.Pet.properties.kind.shape.variants[0]",
    );
    expect(refusedAt((c) => set(first(c).requestBodyEncoding ?? {}, "tags", null))).toBe(
      "groups[0].endpoints[0].requestBodyEncoding.tags",
    );
    expect(refusedAt((c) => set(pet(c).tags?.items ?? {}, "constraints", "x"))).toBe(
      "schemas.Pet.properties.tags.items.constraints",
    );
    expect(
      refusedAt((c) => {
        set(first(c), "requestBody", null);
        set(first(c), "requestBodyEncoding", null);
        set(pet(c).tags ?? {}, "items", null);
        set(pet(c).owner ?? {}, "refName", null);
        set(first(c).responseSchema?.items ?? {}, "refName", null);
        set(pet(c).kind?.shape ?? {}, "variants", null);
        set(codeChecks(c), "pattern", null);
        set(first(c).parameters[0] ?? {}, "encoding", null);
        set(c.schemas.Owner ?? {}, "properties", null);
        set(c.groups[0] ?? {}, "parent", null);
      }),
    ).toBe("nothing refused");
    expect(refusedAt((c) => set(first(c), "parameters", null))).toBe("nothing refused");
  });

  it("refuses a list that is no list, and a map of names that is no object", () => {
    expect(refusedAt((c) => set(pet(c).kind?.shape ?? {}, "variants", { 0: {} }))).toBe(
      "schemas.Pet.properties.kind.shape.variants",
    );
    expect(refusedAt((c) => set(c.groups[0] ?? {}, "endpoints", "list"))).toBe(
      "groups[0].endpoints",
    );
    expect(refusedAt((c) => set(first(c), "parameters", { 0: {} }))).toBe(
      "groups[0].endpoints[0].parameters",
    );
    expect(refusedAt((c) => set(c, "schemas", ["Pet"]))).toBe("schemas");
    expect(refusedAt((c) => set(c.schemas.Pet ?? {}, "properties", "a"))).toBe(
      "schemas.Pet.properties",
    );
  });

  it("checks a specification nested deeper than the stack goes, and names a value deep in it", () => {
    let deep: Record<string, unknown> = { name: "leaf", type: "string" };
    for (let level = 0; level < 20_000; level++) deep = { name: "l", type: "array", items: deep };
    let leaf = deep;
    while (leaf.items) leaf = leaf.items as Record<string, unknown>;

    expect(refusedAt((c) => set(c.schemas, "Deep", deep))).toBe("nothing refused");
    const refusal = refusalOf((c) => {
      set(c.schemas, "Deep", deep);
      leaf.refName = INJECTED;
    });

    expect(refusal?.field).toBe(`schemas.Deep${".items".repeat(20_000)}.refName`);
    expect(refusal?.message.length).toBeLessThan(400);
    expect(refusal?.message).toMatch(
      /^The specification's schemas\.Deep\.items.*….*\.items\.refName "/,
    );
  });

  it("checks a node held twice once as each kind, and one holding itself", () => {
    const looped: Record<string, unknown> = { name: "Loop", type: "array" };
    looped.items = looped;
    const shared: Record<string, unknown> = { name: "Shared", type: "string", required: false };

    expect(refusedAt((c) => set(c.schemas, "Loop", looped))).toBe("nothing refused");
    expect(
      refusedAt((c) => {
        /* Met first as a schema, where a shape is never read, then as a property, where it is. */
        set(c, "schemas", { Shared: shared, ...c.schemas });
        set(pet(c), "shared", shared);
        shared.shape = { name: "s", type: "ref", refName: INJECTED };
      }),
    ).toBe("schemas.Pet.properties.shared.shape.refName");
  });

  it("shows a value by its kind where it cannot be turned into text", () => {
    let nested: unknown = [];
    for (let level = 0; level < 10_000; level++) nested = [nested];

    expect(refusalOf((c) => set(pet(c).owner ?? {}, "refName", { toString: 1 }))?.message).toBe(
      "The specification's schemas.Pet.properties.owner.refName {…} is refused: a name the code is written with is an identifier, in Latin letters, digits, _ and $.",
    );
    expect(refusalOf((c) => set(c.schemas.Owner ?? {}, "type", nested))?.message).toContain(
      "schemas.Owner.type […] is refused",
    );
  });

  it("quotes a key that does not read as a field, and cuts a long one", () => {
    const control = String.fromCharCode(27);
    const long = `a${control}\n${"b".repeat(200_000)}`;

    expect(refusedAt((c) => set(pet(c), "a b", null))).toBe('schemas.Pet.properties["a b"]');
    const refusal = refusalOf((c) => set(pet(c), long, null));

    expect(refusal?.message.length).toBeLessThan(400);
    expect(refusal?.message).toContain('properties["a\\u001b\\nbbb');
    expect(refusal?.message).not.toContain(control);
  });

  it("names the first value it meets, as a list or an object holds them", () => {
    expect(
      refusedAt((c) => {
        set(c.schemas.Labels?.valueType ?? {}, "refName", INJECTED);
        set(pet(c).kind?.shape?.variants?.[0] ?? {}, "refName", INJECTED);
        set(pet(c).owner ?? {}, "refName", INJECTED);
        set(c.groups[0] ?? {}, "name", INJECTED);
      }),
    ).toBe("schemas.Pet.properties.owner.refName");
    expect(
      refusedAt((c) => {
        set(first(c).parameters[1]?.items ?? {}, "refName", INJECTED);
        set(first(c).parameters[0]?.schema ?? {}, "refName", INJECTED);
      }),
    ).toBe("groups[0].endpoints[0].parameters[0].schema.refName");
  });

  it("is what generation refuses with, before a line is written", () => {
    const crafted = structuredClone(spec());
    crafted.schemas[INJECTED] = spec().schemas.Owner as ParsedSchema;

    expect(() => generateCode(crafted, { type: "openapi", outputDir: "src/api" }, "shop")).toThrow(
      expect.objectContaining({ code: "INVALID_SPEC", httpStatus: 400 }),
    );
  });
});

describe("a specification Studio parses", () => {
  const FILES = [
    new URL("../fixtures/generator/kitchen-sink.json", import.meta.url),
    new URL("../../../../e2e/fixtures/specs/billing.v1.json", import.meta.url),
    new URL("../../../../e2e/fixtures/specs/billing.v2.json", import.meta.url),
  ];

  it.each(FILES.map((file) => [file.pathname.split("/").slice(-1)[0], file] as const))(
    "%s passes, and generates with every validator",
    (_name, file) => {
      const parsed = parseSpec(readFileSync(file, "utf8"));

      expect(() => assertGeneratable(parsed)).not.toThrow();
      for (const validation of ["zod", "valibot", "arktype", "none"] as const) {
        expect(
          generateCode(parsed, { type: "openapi", outputDir: "src/api", validation }, "shop")
            .length,
        ).toBeGreaterThan(0);
      }
    },
  );

  it("passes nested 300 levels deep, as the parser gives one, and generates", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let level = 0; level < 300; level++) schema = { type: "array", items: schema };
    const parsed = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Deep", version: "1" },
        paths: {},
        components: { schemas: { Deep: schema } },
      }),
    );

    expect(() => assertGeneratable(parsed)).not.toThrow();
    expect(
      generateCode(parsed, { type: "openapi", outputDir: "src/api" }, "deep").length,
    ).toBeGreaterThan(0);
  });
});
