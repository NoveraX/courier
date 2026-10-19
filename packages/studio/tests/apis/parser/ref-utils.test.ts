/**
 * A local JSON pointer is followed segment by segment, its `~1`, `~0` and
 * percent escapes decoded. A segment whose percent escape decodes to no text
 * names no key: it resolves to nothing, as a pointer the document does not
 * define does, rather than failing the whole read — and never to a key its
 * raw text might spell.
 */
import { describe, expect, it } from "vitest";

import { componentSchemaName, resolveRef } from "../../../src/apis/parser/ref-utils";

const SPEC = {
  components: { schemas: { "Pet Store": { type: "object" }, Zz: { type: "string" } } },
  paths: { "/pets": { get: { operationId: "listPets" } } },
};

describe("resolveRef", () => {
  it.each(["%zz", "%E0%A4%A", "%C3%28"])(
    "resolves nothing for a segment escaped as %s",
    (segment) => {
      expect(resolveRef(SPEC, `#/components/schemas/${segment}`)).toEqual({});
    },
  );

  it("still decodes a well-formed escape", () => {
    expect(resolveRef(SPEC, "#/components/schemas/Pet%20Store")).toEqual({ type: "object" });
    expect(resolveRef(SPEC, "#/paths/~1pets/get")).toEqual({ operationId: "listPets" });
  });
});

describe("componentSchemaName", () => {
  it("names no component for a name whose escape is malformed", () => {
    expect(componentSchemaName("#/components/schemas/%zz")).toBeUndefined();
    expect(componentSchemaName("#/definitions/%C3%28")).toBeUndefined();
  });

  it("names a component by its escaped name decoded", () => {
    expect(componentSchemaName("#/components/schemas/Pet%20Store")).toBe("Pet Store");
    expect(componentSchemaName("#/definitions/Pet~1Store")).toBe("Pet/Store");
  });
});
