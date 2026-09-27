/**
 * Generated schemas, run against the real validation libraries.
 *
 * The emission tests compare text; these load what the generator writes and
 * validate values with it.
 */
import ts from "typescript";
import * as arktype from "arktype";
import * as valibot from "valibot";
import { describe, expect, it } from "vitest";
import * as zod from "zod";

import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";
import { SHAPES_SPEC } from "./helpers/shapes-spec";

const LIBRARIES: Record<string, unknown> = { zod, valibot, arktype };
const VALIDATORS = ["zod", "valibot", "arktype"] as const;

interface StandardSchema {
  "~standard": { validate: (value: unknown) => { issues?: unknown[] } | Promise<unknown> };
}


/** Transpile a generated file and evaluate it with the real library. */
function load(source: string): Record<string, StandardSchema> {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, StandardSchema> = {};
  new Function("require", "exports", outputText)((id: string) => LIBRARIES[id], exports);
  return exports;
}

function schemasFor(validation: (typeof VALIDATORS)[number]): Record<string, StandardSchema> {
  const files = generateCode(
    parseSpec(JSON.stringify(SHAPES_SPEC)),
    { type: "openapi", sourceName: "api", outputDir: "src", validation },
  );
  const file = files.find((f) => f.path.endsWith("schemas.ts"));
  return load(file?.content ?? "");
}

function accepts(schema: StandardSchema | undefined, value: unknown): boolean {
  if (!schema) throw new Error("schema was not generated");
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected a synchronous validator");
  return result.issues === undefined;
}

describe.each(VALIDATORS)("%s", (validation) => {
  const schemas = schemasFor(validation);
  const product = { id: "prod_1", object: "product" };

  describe("an expandable field", () => {
    it("accepts the id string the API returns by default", () => {
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: "prod_1" })).toBe(true);
    });

    it("accepts the expanded object", () => {
      expect(accepts(schemas.PriceSchema, { id: "price_1", product })).toBe(true);
    });

    it("accepts the deleted form", () => {
      const deleted = { id: "prod_1", deleted: true };
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: deleted })).toBe(true);
    });

    it("rejects anything else", () => {
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: 5 })).toBe(false);
    });
  });

  describe("objects that refer to each other", () => {
    it("validates through the cycle", () => {
      const nested = { ...product, default_price: { id: "price_2", product: "prod_1" } };
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: nested })).toBe(true);
    });

    it("finds a wrong value on the far side of the cycle", () => {
      const nested = { ...product, default_price: { id: "price_2", product: 5 } };
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: nested })).toBe(false);
    });

    it("keeps null where the property allows it", () => {
      const nested = { ...product, default_price: null };
      expect(accepts(schemas.PriceSchema, { id: "price_1", product: nested })).toBe(true);
    });
  });

  describe("a map with typed values", () => {
    it("checks each value", () => {
      const price = { id: "price_1", product: "prod_1" };
      expect(accepts(schemas.PriceSchema, { ...price, metadata: { a: "x" } })).toBe(true);
      expect(accepts(schemas.PriceSchema, { ...price, metadata: { a: 1 } })).toBe(false);
    });
  });

  describe("a { type: null } alternative", () => {
    const answer = { text: "hi", refusal: null, kind: "answer" };

    it("allows null beside a primitive", () => {
      expect(accepts(schemas.AnswerSchema, { ...answer, text: null })).toBe(true);
    });

    it("allows null beside a reference, and still checks the reference", () => {
      expect(accepts(schemas.AnswerSchema, answer)).toBe(true);
      expect(accepts(schemas.AnswerSchema, { ...answer, refusal: { reason: "no" } })).toBe(true);
      expect(accepts(schemas.AnswerSchema, { ...answer, refusal: { reason: 1 } })).toBe(false);
    });

    it("keeps the constant", () => {
      expect(accepts(schemas.AnswerSchema, { ...answer, kind: "other" })).toBe(false);
    });
  });

  describe("a union on a cycle beside an overlapping enum", () => {
    it("loads, and validates both alternatives", () => {
      expect(accepts(schemas.ExprSchema, "leaf")).toBe(true);
      expect(accepts(schemas.ExprSchema, { all: ["x", "y", { all: [] }] })).toBe(true);
      expect(accepts(schemas.ExprSchema, { all: [{ all: [7] }] })).toBe(false);
    });
  });
});
