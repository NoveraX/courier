import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { jsLiteral, objectKey } from "../src/apis/generator/literals";
import { propToArkType, schemaToArkType } from "../src/apis/generator/validation-arktype";
import { propToValibot, valibotEnum } from "../src/apis/generator/validation-valibot";
import { parseSpec } from "../src/apis/parser";
import type { ParsedSchema, ParsedSchemaProperty } from "../src/apis/parser/types";

type Validation = "zod" | "valibot" | "arktype" | "none";

function generate(schemas: Record<string, unknown>, validation: Validation): string {
  return generateCode(
    parseSpec(
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Emission", version: "1.0.0" },
        paths: {
          "/things": {
            get: {
              operationId: "list",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Root" } },
                  },
                },
              },
            },
          },
        },
        components: { schemas },
      }),
    ),
    { type: "openapi", sourceName: "api", outputDir: "src/api", validation },
  )
    .map((f) => f.content)
    .join("\n");
}

const prop = (over: Partial<ParsedSchemaProperty>): ParsedSchemaProperty =>
  ({ type: "string", required: false, ...over }) as ParsedSchemaProperty;

describe("literal writers", () => {
  it("escapes a value that carries a quote", () => {
    expect(jsLiteral('a"b')).toBe('"a\\"b"');
  });

  it("escapes a value that carries a backslash", () => {
    expect(jsLiteral("a\\b")).toBe('"a\\\\b"');
  });

  it("writes what would end a script element, or a line in an older parser, as escapes that read back the same", () => {
    for (const value of ["</script><script>alert(1)</script>", "a\u2028b\u2029c", "x > y"]) {
      const written = jsLiteral(value);

      expect(written).not.toMatch(/[<>\u2028\u2029]/);
      expect(JSON.parse(written)).toBe(value);
    }
    expect(objectKey("<b>")).toBe('"\\u003cb\\u003e"');
  });

  it("writes a list as JSON writes it, each of its values escaped the same", () => {
    const values = ["id", "q</script>\u2028", "x > y\u2029"];
    const written = jsLiteral(values);

    expect(jsLiteral(["a", "b"])).toBe('["a","b"]');
    expect(written).not.toMatch(/[<>\u2028\u2029]/);
    expect(JSON.parse(written)).toEqual(values);
  });

  it("quotes a key only when it must", () => {
    expect(objectKey("id")).toBe("id");
    expect(objectKey("user-id")).toBe('"user-id"');
    expect(objectKey('a"b')).toBe('"a\\"b"');
  });
});

describe("arktype emission", () => {
  it("writes a union inside one string, not as a JavaScript operator", () => {
    /* `type("string" | "null")` is a bitwise-or of two strings: it evaluates
       to 0 and ArkType rejects it at load. */
    const emitted = propToArkType(prop({ type: "string", nullable: true }));

    expect(emitted).toBe('type("string | null")');
  });

  it("gives an enum's members to ArkType as values", () => {
    expect(propToArkType(prop({ enum: ["open", "fixed"] }))).toBe(
      'type.enumerated("open", "fixed")',
    );
  });

  it("adds null to a nullable enum", () => {
    expect(propToArkType(prop({ enum: ["open"], nullable: true }))).toBe(
      'type.enumerated("open", null)',
    );
  });

  it("gives a primitive array something to call .array() on", () => {
    const emitted = schemaToArkType({
      name: "X",
      type: "array",
      items: { name: "Y", type: "string" },
    } as ParsedSchema);

    expect(emitted).toBe('type("string").array()');
    expect(emitted).not.toMatch(/^"string"\.array/);
  });

  it("keeps a member that holds both kinds of quote", () => {
    /* ArkType's string syntax has no escape for such a member; as a value it
       needs none. */
    const emitted = propToArkType(prop({ enum: [`it's "both"`] }));

    expect(emitted).toBe(`type.enumerated(${JSON.stringify(`it's "both"`)})`);
  });

  it("emits a named enum schema that is one expression", () => {
    const out = generate({ Root: { type: "string", enum: ["open", "fixed"] } }, "arktype");

    expect(out).not.toMatch(/type\("[^"]*" \| "/);
  });
});

describe("valibot emission", () => {
  it("keeps the members of a property enum", () => {
    /* Dropping them left a plain string, which then failed the `satisfies`
       assertion written beside it. */
    expect(propToValibot(prop({ enum: ["read", "write"] }))).toBe('v.picklist(["read", "write"])');
  });

  it("escapes a member that carries a quote", () => {
    expect(valibotEnum(['a"b'])).toBe('v.picklist(["a\\"b"])');
  });

  it("uses literals for members that are not strings", () => {
    expect(valibotEnum([true])).toBe("v.literal(true)");
  });
});

describe("object keys from a specification", () => {
  it.each(["zod", "valibot", "arktype"] as const)("are escaped for %s", (validation) => {
    const out = generate(
      {
        Root: {
          type: "object",
          properties: { 'weird"key': { type: "string" } },
          required: ['weird"key'],
        },
      },
      validation,
    );

    expect(out).toContain('weird\\"key');
  });
});
