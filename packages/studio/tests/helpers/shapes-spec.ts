/**
 * A specification carrying the shapes real APIs use that are hardest to
 * generate: Stripe's expandable fields (an id string or the expanded object), OpenAI's
 * `{ type: "null" }` alternatives, a map with typed values, objects that
 * refer to each other through those fields, and a union on a cycle beside an
 * enum it overlaps.
 */
export const SHAPES_SPEC = {
  openapi: "3.1.0",
  info: { title: "Shapes", version: "1.0.0" },
  paths: {
    "/prices": {
      get: {
        operationId: "listPrices",
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    price: { $ref: "#/components/schemas/Price" },
                    answer: { $ref: "#/components/schemas/Answer" },
                    expr: { $ref: "#/components/schemas/Expr" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Product: {
        type: "object",
        required: ["id", "object"],
        properties: {
          id: { type: "string" },
          object: { type: "string", enum: ["product"] },
          default_price: {
            anyOf: [{ type: "string" }, { $ref: "#/components/schemas/Price" }],
            nullable: true,
          },
        },
      },
      DeletedProduct: {
        type: "object",
        required: ["id", "deleted"],
        properties: { id: { type: "string" }, deleted: { type: "boolean", enum: [true] } },
      },
      Price: {
        type: "object",
        required: ["id", "product"],
        properties: {
          id: { type: "string" },
          product: {
            anyOf: [
              { type: "string" },
              { $ref: "#/components/schemas/Product" },
              { $ref: "#/components/schemas/DeletedProduct" },
            ],
          },
          metadata: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      Refusal: {
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string" } },
      },
      Answer: {
        type: "object",
        required: ["text", "refusal", "kind"],
        properties: {
          text: { anyOf: [{ type: "string" }, { type: "null" }] },
          refusal: { anyOf: [{ $ref: "#/components/schemas/Refusal" }, { type: "null" }] },
          kind: { const: "answer" },
        },
      },
      /* A union on a cycle whose own alternatives overlap an enum beside it:
         ArkType probes such a branch while still building the union. */
      Expr: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            required: ["all"],
            properties: {
              all: {
                type: "array",
                items: { anyOf: [{ $ref: "#/components/schemas/Expr" }, { enum: ["x"] }] },
              },
            },
          },
        ],
      },
    },
  },
};
