/**
 * Variables checked against what their schema takes before the Playground
 * sends them: the type of each value where it sits, the values an enum
 * allows, the fields an object is refused without, the form of a union a
 * value is meant as, and how each reads in the editor's status line.
 */
import type { OutlineField, SchemaOutline } from "@noverax/courier-studio-core";
import { describe, expect, it } from "vitest";

import { variablesCheckOf } from "@/features/playground/input-check";
import { outlineProblemOf } from "@/features/playground/outline-check";
import { outlineLabel } from "@/features/playground/outline-label";

const STRING = { type: "string" } as const;

const CHARGE: SchemaOutline = {
  type: "object",
  fields: [
    { name: "orderId", required: true, outline: STRING },
    { name: "amount", required: true, outline: { type: "number" } },
    { name: "currency", required: false, outline: { type: "enum", values: ["EUR", "USD"] } },
    {
      name: "note",
      required: false,
      outline: { type: "union", options: [STRING, { type: "null" }] },
    },
    {
      name: "items",
      required: false,
      outline: {
        type: "array",
        items: { type: "object", fields: [{ name: "sku", required: true, outline: STRING }] },
      },
    },
    {
      name: "shipping",
      required: false,
      outline: { type: "object", fields: [{ name: "method", required: true, outline: STRING }] },
    },
    { name: "meta", required: false },
  ],
};

/* A form of a payment: the `kind` that names it, the field it needs, and fields every form has. */
function paymentForm(kind: string, needs: string, shared: OutlineField[] = []): SchemaOutline {
  return {
    type: "object",
    fields: [
      ...shared,
      { name: "kind", required: true, outline: { type: "enum", values: [kind] } },
      { name: needs, required: true, outline: STRING },
    ],
  };
}

const PAYMENT: SchemaOutline = {
  type: "union",
  options: [paymentForm("card", "number"), paymentForm("bank", "iban")],
};

const VALID = "Valid · matches the types and required fields of charges.create";

function check(text: string, outline: SchemaOutline = CHARGE): string {
  return variablesCheckOf(text, { variablesOutline: outline }, "charges.create").label;
}

function paying(payment: string, forms: SchemaOutline = PAYMENT): string {
  return check(`{ "payment": ${payment} }`, {
    type: "object",
    fields: [{ name: "payment", required: true, outline: forms }],
  });
}

describe("variables checked against what their schema takes", () => {
  it("name a value of another type, where it sits", () => {
    expect(check('{ "orderId": 1, "amount": 0 }')).toBe('"orderId" expects string, got number');
    expect(check('{ "orderId": "o1", "amount": "5" }')).toBe('"amount" expects number, got string');
    expect(check('{ "orderId": "o1", "amount": 5, "items": [{ "sku": "a" }, { "sku": 2 }] }')).toBe(
      '"items[1].sku" expects string, got number',
    );
    expect(check('{ "orderId": "o1", "amount": 5, "items": {} }')).toBe(
      '"items" expects object[], got object',
    );
  });

  it("quote a value an enum does not list, and name one of another type by its type", () => {
    expect(check('{ "orderId": "o1", "amount": 5, "currency": "GBP" }')).toBe(
      '"currency" expects "EUR" | "USD", got "GBP"',
    );
    expect(check('{ "orderId": "o1", "amount": 5, "currency": 978 }')).toBe(
      '"currency" expects "EUR" | "USD", got number',
    );
  });

  it("take null where the schema takes it, and any value where the outline cannot tell", () => {
    expect(check('{ "orderId": "o1", "amount": 5, "note": null, "meta": [1, "x"] }')).toBe(VALID);
    expect(check('{ "orderId": null, "amount": 5 }')).toBe('"orderId" expects string, got null');
  });

  it("ask for a required field only of an object that is there", () => {
    expect(check('{ "amount": 5 }')).toBe('Missing required field "orderId"');
    expect(check('{ "orderId": "o1", "amount": 5, "shipping": {} }')).toBe(
      'Missing required field "shipping.method"',
    );
  });

  it("count a field the variables hold themselves, not one every object inherits", () => {
    const outline: SchemaOutline = {
      type: "object",
      fields: [{ name: "constructor", required: true, outline: STRING }],
    };

    expect(check("{}", outline)).toBe('Missing required field "constructor"');
    expect(check('{ "constructor": "a" }', outline)).toMatch(/^Valid · /);
  });

  it("say when the variables themselves are of another type", () => {
    expect(check("[]")).toBe("Variables expect object, got array");
    expect(check('"o1"')).toBe("Variables expect object, got string");
  });

  it("check a union's form by the value's type, or by the tag that names it", () => {
    expect(paying('{ "kind": "card", "number": "4242" }')).toMatch(/^Valid · /);
    expect(paying('{ "kind": "card", "iban": "DE00" }')).toBe(
      'Missing required field "payment.number"',
    );
    expect(paying('{ "kind": "cash" }')).toBe('"payment.kind" expects "card" | "bank", got "cash"');
    expect(paying('{ "number": "4242" }')).toBe('Missing required field "payment.kind"');
    expect(paying('"card"')).toBe('"payment" expects object, got string');
  });

  it("take for the tag a field each form fixes to values of its own, not one they share", () => {
    const version: OutlineField = {
      name: "version",
      required: true,
      outline: { type: "enum", values: ["v1"] },
    };
    const versioned: SchemaOutline = {
      type: "union",
      options: [paymentForm("card", "number", [version]), paymentForm("bank", "iban", [version])],
    };

    expect(paying('{ "version": "v1", "kind": "cash" }', versioned)).toBe(
      '"payment.kind" expects "card" | "bank", got "cash"',
    );
    expect(paying('{ "version": "v1", "kind": "bank" }', versioned)).toBe(
      'Missing required field "payment.iban"',
    );
  });

  it("say a value fits none of a union's forms when no tag tells them apart", () => {
    const forms: SchemaOutline = {
      type: "union",
      options: [
        { type: "object", fields: [{ name: "id", required: true, outline: STRING }] },
        { type: "object", fields: [{ name: "email", required: true, outline: STRING }] },
      ],
    };

    expect(check('{ "name": "Ada" }', forms)).toBe(
      "Variables fit none of the 2 forms their schema takes",
    );
    expect(
      outlineProblemOf(
        { list: { id: 1 } },
        { type: "object", fields: [{ name: "list", required: true, outline: forms }] },
      ),
    ).toEqual({ kind: "forms", path: "list", count: 2 });
  });

  it("are only parsed when Studio cannot read the schema, and not checked when empty", () => {
    expect(variablesCheckOf('{ "orderId": 1 }', {}, "charges.create")).toEqual({
      tone: "ok",
      label: "Valid JSON",
    });
    expect(variablesCheckOf("  ", { variablesOutline: CHARGE }, "charges.create").label).toBe(
      "Empty · sent without variables",
    );
  });
});

describe("what a part of a schema takes, as a problem names it", () => {
  it("reads as the schema table writes a type", () => {
    const either = { type: "union", options: [STRING, { type: "number" }] } as const;

    expect(outlineLabel({ type: "array", items: either })).toBe("(string | number)[]");
    expect(outlineLabel({ type: "array" })).toBe("array");
    expect(outlineLabel({ type: "enum", values: ["a", 1, true, null] })).toBe(
      '"a" | 1 | true | null',
    );
    expect(outlineLabel({ type: "enum", values: ["a", "b", "c", "d", "e"] })).toBe(
      "one of 5 values",
    );
    expect(
      outlineLabel({
        type: "union",
        options: [{ type: "object" }, { type: "object", fields: [] }, { type: "null" }],
      }),
    ).toBe("object | null");
  });
});
