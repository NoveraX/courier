/**
 * An operation with no tag is in no group: it sits in the API itself. A
 * specification that tags none of its operations is marked so: grouped by
 * tag, no endpoint would be in a group, and every schema would be in one
 * file — Stripe's runs to megabytes. The mark changes no hash an update
 * compares.
 */
import { describe, expect, it } from "vitest";

import { computeSpecHash } from "../../../src/apis";
import { parseSpec } from "../../../src/apis/parser";

const ok = { "200": { description: "ok" } };

function specWith(tags: { list?: string[]; create?: string[] }, swagger = false): string {
  const operation = (operationId: string, own?: string[]) => ({
    operationId,
    ...(own && { tags: own }),
    responses: ok,
  });
  const paths = {
    "/charges": {
      get: operation("listCharges", tags.list),
      post: operation("createCharge", tags.create),
    },
  };
  return JSON.stringify(
    swagger
      ? { swagger: "2.0", info: { title: "Pay", version: "1" }, paths }
      : { openapi: "3.1.0", info: { title: "Pay", version: "1" }, paths },
  );
}

describe("a specification whose operations declare no tag", () => {
  it("puts every operation in the API itself, at its whole path", () => {
    const { groups } = parseSpec(specWith({}));

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "", prefix: "" });
    expect(groups[0]?.endpoints.map((e) => [e.name, e.path])).toEqual([
      ["listCharges", "/charges"],
      ["createCharge", "/charges"],
    ]);
  });

  it("puts only the operations with no tag there once some declare one", () => {
    const { groups } = parseSpec(specWith({ create: ["charges"] }));

    expect(groups.map((g) => [g.name, g.endpoints.map((e) => e.name)])).toEqual([
      ["", ["listCharges"]],
      ["charges", ["createCharge"]],
    ]);
  });

  it("is marked untagged, in OpenAPI 3 and in Swagger 2", () => {
    expect(parseSpec(specWith({})).untagged).toBe(true);
    expect(parseSpec(specWith({}, true)).untagged).toBe(true);
  });

  it("is not marked once any operation declares one", () => {
    expect(parseSpec(specWith({ create: ["charges"] }))).not.toHaveProperty("untagged");
    expect(parseSpec(specWith({ list: ["charges"], create: ["charges"] }))).not.toHaveProperty(
      "untagged",
    );
  });

  it("keeps the hash an update check compares", () => {
    const spec = parseSpec(specWith({}));
    const { untagged: _mark, ...unmarked } = spec;

    expect(computeSpecHash(spec)).toBe(computeSpecHash(unmarked));
  });
});
