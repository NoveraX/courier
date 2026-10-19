/**
 * Which endpoints become tools, under what names, with what schemas — and
 * the declarations that stop a server before a model ever sees them.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkedPolicy } from "../../src/policy/checked-policy";
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
      byMethod: endpoint.post("ops/:name::cancel").agent({ description: "C", access: "write" }),
      byRepeated: endpoint.get(":id/copies/:id").agent(read("R")),
      byUnion: endpoint
        .post("u")
        .variables(z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]))
        .agent({ description: "U", access: "write" }),
      byDefaulted: endpoint
        .get("news")
        .variables(z.object({ group: z.string(), groupBy: z.enum(["year", "month"]) }))
        .defaults({ groupBy: "year" })
        .agent(read("N")),
      byTypeDefaults: endpoint
        .get("latest")
        .variables<{ limit: number }>()
        .defaults({ limit: 5 })
        .agent(read("L")),
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

  it("shows what the endpoint defaults with its default, and not required", () => {
    expect(byName.get("byDefaulted")?.inputSchema).toMatchObject({
      type: "object",
      properties: { group: { type: "string" }, groupBy: { default: "year" } },
      required: ["group"],
    });
    expect(byName.get("byTypeDefaults")?.inputSchema).toEqual({
      type: "object",
      properties: { limit: { type: "integer", default: 5 } },
    });
  });

  it("names a path's parameters when the variables have no schema to show", () => {
    expect(byName.get("byPath")?.inputSchema).toEqual({
      type: "object",
      properties: { id: { type: ["string", "number"] }, part: { type: ["string", "number"] } },
      required: ["id", "part"],
    });
    expect(byName.get("byPath")?.takesVariables).toBe(false);
  });

  it("names no parameter for a colon the path sends as written, and each parameter once", () => {
    expect(byName.get("byMethod")?.inputSchema).toEqual({
      type: "object",
      properties: { name: { type: ["string", "number"] } },
      required: ["name"],
    });
    expect(byName.get("byRepeated")?.inputSchema).toEqual({
      type: "object",
      properties: { id: { type: ["string", "number"] } },
      required: ["id"],
    });
  });
});

describe("a catalog under the agents policy", () => {
  const shop = defineApi({
    name: "shop",
    baseURL: "https://s.example",
    groups: {
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          get: endpoint.get(":id").meta({ summary: "One order by its id" }),
          list: endpoint.get(""),
          create: endpoint.post("").meta({ description: "  Place an order  " }),
          cancel: endpoint.del(":id"),
          refund: endpoint
            .post(":id/refund")
            .agent({ description: "Refund an order in full", access: "destructive" }),
          payouts: endpoint.get("payouts").agent(false),
        },
      }),
    },
  });
  const billing = defineApi({
    name: "billing",
    baseURL: "https://b.example",
    endpoints: { charge: endpoint.post("charge") },
  });

  it("offers every read with offer reads, each describing itself from its definition or its call", () => {
    const { tools } = buildCatalog({ shop }, { policy: checkedPolicy({ offer: "reads" }) });

    expect(
      tools.map((tool) => [tool.name, tool.offeredBy, tool.agent.access, tool.agent.description]),
    ).toEqual([
      ["orders_get", "offer", "read", "One order by its id"],
      ["orders_list", "offer", "read", "GET orders — shop.orders.list"],
      ["orders_refund", "marked", "destructive", "Refund an order in full"],
    ]);
  });

  it("offers writes with the access their verb implies, and a person confirms as confirm says", () => {
    const { tools } = buildCatalog(
      { shop },
      { policy: checkedPolicy({ offer: "all", confirm: "write" }) },
    );

    expect(
      tools.map((tool) => [tool.name, tool.agent.access, tool.confirm, tool.agent.description]),
    ).toEqual([
      ["orders_get", "read", false, "One order by its id"],
      ["orders_list", "read", false, "GET orders — shop.orders.list"],
      ["orders_create", "write", true, "Place an order"],
      ["orders_cancel", "destructive", true, "DELETE orders/:id — shop.orders.cancel"],
      ["orders_refund", "destructive", true, "Refund an order in full"],
    ]);
  });

  it("says for every endpoint what decided it, and the tool it became", () => {
    const { entries } = buildCatalog(
      { shop },
      { policy: checkedPolicy({ offer: "reads", deny: ["shop.orders.get"] }) },
    );

    expect(
      entries.map((entry) => [entry.path, entry.verb, entry.decision.by, entry.tool ?? null]),
    ).toEqual([
      ["shop.orders.get", "GET", "deny", null],
      ["shop.orders.list", "GET", "offer", "orders_list"],
      ["shop.orders.create", "POST", "unmarked", null],
      ["shop.orders.cancel", "DELETE", "unmarked", null],
      ["shop.orders.refund", "POST", "marked", "orders_refund"],
      ["shop.orders.payouts", "GET", "opted-out", null],
    ]);
  });

  it("leaves out an offered endpoint whose name a marked tool holds, or one too long, saying why", () => {
    const clash = defineApi({
      name: "clash",
      baseURL: "https://c.example",
      endpoints: {
        list: endpoint.get("list"),
        count: endpoint.get("count").agent({ ...read("How many"), name: "list" }),
        [`a${"x".repeat(70)}`]: endpoint.get("long"),
      },
    });

    const catalog = buildCatalog({ clash }, { policy: checkedPolicy({ offer: "reads" }) });

    expect(catalog.tools.map((tool) => tool.name)).toEqual(["list"]);
    expect(catalog.byName.get("list")?.path).toBe("clash.count");
    expect(catalog.entries.map((entry) => entry.left ?? null)).toEqual([
      "its tool name list is clash.count's: mark it .agent({ name })",
      null,
      "its tool name would be longer than the 64 characters a client takes: mark it .agent({ name })",
    ]);
    expect(catalog.warnings).toEqual([
      "clash.list is offered, but left out: its tool name list is clash.count's: mark it .agent({ name })",
      `clash.a${"x".repeat(70)} is offered, but left out: its tool name would be longer than the 64 characters a client takes: mark it .agent({ name })`,
    ]);
  });

  it("warns of a pattern that names no endpoint of any source, served or not", () => {
    const policy = checkedPolicy({ deny: ["billing.**", "payments.**"], allow: ["shop.orderz.*"] });

    const { warnings } = buildCatalog({ shop, billing }, { only: ["shop"], policy });

    expect(warnings).toEqual([
      'agents.deny has "payments.**", which names no endpoint',
      'agents.allow has "shop.orderz.*", which names no endpoint',
    ]);
  });

  it("warns past 40 tools, where some clients slow down or leave tools out", () => {
    const wide = defineApi({
      name: "wide",
      baseURL: "https://w.example",
      endpoints: Object.fromEntries(
        Array.from({ length: 41 }, (_, at) => [`read${at}`, endpoint.get(`r/${at}`)]),
      ),
    });

    const { tools, warnings } = buildCatalog(
      { wide },
      { policy: checkedPolicy({ offer: "reads" }) },
    );

    expect(tools).toHaveLength(41);
    expect(warnings).toEqual([expect.stringMatching(/^41 tools are offered: past 40/)]);
    expect(buildCatalog({ wide }).warnings).toEqual([]);
  });
});
