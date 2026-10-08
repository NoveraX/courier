/**
 * Which endpoints become tools, under what names, with what schemas — and
 * the declarations that stop a server before a model ever sees them.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildCatalog } from "../../src/tools/catalog";

const { endpoint } = courier();
const read = (description: string) => ({ description, access: "read" as const });

describe("a catalog", () => {
  const billing = defineApi({
    name: "billing",
    baseURL: "https://b.example",
    endpoints: { health: endpoint.get("health").agent(read("Whether billing answers")) },
    groups: {
      invoices: defineGroup({
        prefix: "invoices",
        groups: {
          drafts: defineGroup({
            prefix: "drafts",
            endpoints: {
              list: endpoint.get("").agent(read("Draft invoices")),
              hidden: endpoint.get("hidden"),
            },
          }),
        },
      }),
    },
  });

  it("offers the endpoints marked .agent() alone, named by their call in the client", () => {
    const { tools } = buildCatalog({ billing });

    expect(tools.map((tool) => [tool.name, tool.path, tool.target])).toEqual([
      ["health", "billing.health", { source: "billing", group: undefined, method: "health" }],
      [
        "invoices_drafts_list",
        "billing.invoices.drafts.list",
        { source: "billing", group: "invoices.drafts", method: "list" },
      ],
    ]);
  });

  it("leads each name with its source when it offers several, and takes the name .agent() gives", () => {
    const shop = defineApi({
      name: "shop",
      baseURL: "https://s.example",
      endpoints: {
        health: endpoint
          .get("health")
          .agent({ ...read("Whether the shop answers"), name: "shop-health" }),
      },
    });

    const { tools } = buildCatalog({ billing, shop });

    expect(tools.map((tool) => tool.name)).toEqual([
      "billing_health",
      "billing_invoices_drafts_list",
      "shop-health",
    ]);
    expect(
      buildCatalog({ billing, shop }, { only: ["shop"] }).tools.map((tool) => tool.name),
    ).toEqual(["shop-health"]);
  });

  it("stops at two tools under one name, a write offered as a read, and a name too long", () => {
    const twice = defineApi({
      name: "twice",
      baseURL: "https://t.example",
      endpoints: {
        a: endpoint.get("a").agent({ ...read("A"), name: "same" }),
        b: endpoint.get("b").agent({ ...read("B"), name: "same" }),
      },
    });
    const sneaky = defineApi({
      name: "sneaky",
      baseURL: "https://s.example",
      endpoints: { wipe: endpoint.post("wipe").agent(read("Looks harmless") as never) },
    });
    const long = defineApi({
      name: "long",
      baseURL: "https://l.example",
      endpoints: { [`a${"x".repeat(70)}`]: endpoint.get("x").agent(read("Long")) },
    });

    expect(() => buildCatalog({ twice })).toThrow(
      expect.objectContaining({ code: "AGENT_TOOL_NAME_TAKEN" }),
    );
    expect(() => buildCatalog({ sneaky })).toThrow(
      expect.objectContaining({ code: "AGENT_READ_ON_WRITE" }),
    );
    expect(() => buildCatalog({ long })).toThrow(/more than the 64 a client takes/);
  });
});

describe("a tool's schemas", () => {
  const api = defineApi({
    name: "api",
    baseURL: "https://a.example",
    endpoints: {
      byObject: endpoint
        .post("o")
        .variables(z.object({ q: z.string() }))
        .response(z.object({ n: z.number() }))
        .agent({ description: "O", access: "write" }),
      byString: endpoint
        .post("s")
        .variables(z.string().min(1))
        .agent({ description: "S", access: "write" }),
      byPath: endpoint.get("items/:id/parts/:part").agent(read("P")),
      byUnion: endpoint
        .post("u")
        .variables(z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]))
        .agent({ description: "U", access: "write" }),
    },
  });
  const byName = buildCatalog({ api }).byName;

  it("takes object variables as the arguments themselves, and says what comes back", () => {
    const tool = byName.get("byObject");
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(tool?.inputSchema).not.toHaveProperty("$schema");
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      properties: { n: { type: "number" } },
    });
    expect([tool?.wrapsValue, tool?.takesVariables]).toEqual([false, true]);
  });

  it("wraps variables that are no object as { value }, and keeps a choice of objects as it is", () => {
    expect(byName.get("byString")?.inputSchema).toEqual({
      type: "object",
      properties: { value: { type: "string", minLength: 1 } },
      required: ["value"],
      additionalProperties: false,
    });
    expect(byName.get("byString")?.wrapsValue).toBe(true);
    expect(byName.get("byUnion")?.inputSchema).toMatchObject({
      type: "object",
      anyOf: [{ type: "object" }, { type: "object" }],
    });
    expect(byName.get("byUnion")?.wrapsValue).toBe(false);
  });

  it("names a path's parameters when the variables have no schema to show", () => {
    expect(byName.get("byPath")?.inputSchema).toEqual({
      type: "object",
      properties: { id: { type: ["string", "number"] }, part: { type: ["string", "number"] } },
      required: ["id", "part"],
    });
    expect(byName.get("byPath")?.takesVariables).toBe(false);
  });
});
