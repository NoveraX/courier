/**
 * The schema of a body a Postman collection gives only by example. A null
 * is typed as a null field is, `any`, at the top level too, not as an
 * object.
 */
import { describe, expect, it } from "vitest";

import { inferSchemaFromValue } from "../../../src/apis/parser/infer-schema";

describe("a schema inferred from an example value", () => {
  it("types a null as it types a null field", () => {
    expect(inferSchemaFromValue("Body", null)).toEqual({ name: "Body", type: "any" });
    expect(inferSchemaFromValue("Body", { note: null }).properties?.note?.type).toBe("any");
  });

  it("types a scalar by its JSON type", () => {
    expect(inferSchemaFromValue("Body", 3).type).toBe("number");
    expect(inferSchemaFromValue("Body", true).type).toBe("boolean");
    expect(inferSchemaFromValue("Body", "text").type).toBe("string");
  });

  it("types a nested object by its own fields, and a list by its first element", () => {
    const body = inferSchemaFromValue("Body", {
      details: { id: "x", amount: 1 },
      items: [{ id: "a", price: 1 }],
    });

    expect(body.properties?.details?.shape?.properties?.amount?.type).toBe("number");
    expect(body.properties?.items?.items?.type).toBe("object");
    expect(body.properties?.items?.items?.properties?.price?.type).toBe("number");
  });
});
