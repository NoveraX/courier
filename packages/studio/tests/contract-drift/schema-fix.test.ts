/**
 * Fixing a response schema from its endpoint's real answers, in the source
 * a person wrote: where the schema is declared — through the config, its
 * groups and the imports between — the edits planned there and shown as a
 * diff, the change written and the config loaded again, put back when it
 * does not load or does not reach the schema, and taken back on request.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { answerShapeOf } from "@noverax/courier/internal";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type LoadedCourierConfig, loadCourierConfig } from "../../src/server/config-loader";
import { contractReport } from "../../src/server/contract-drift/contract-report";
import {
  type AppliedFix,
  applySchemaFix,
} from "../../src/server/contract-drift/schema-edit/schema-fix-apply";
import { planSchemaFix } from "../../src/server/contract-drift/schema-edit/schema-fix-plan";
import { undoSchemaFix } from "../../src/server/contract-drift/schema-edit/schema-fix-undo";
import type { ExclusiveContext } from "../../src/server/exclusive-context";
import {
  type AnswerObservations,
  createAnswerObservations,
} from "../../src/server/storage/answer-observations";
import { migrate } from "../../src/server/storage/migrate";

const SCHEMAS = `import { z } from "zod";

export const Seller = z.object({
  name: z.string(),
});

export const Product = z.object({
  id: z.string(),
  price: z.number().int().optional(),
  stock: z.number(),
  seller: Seller,
});
`;

const SHOP = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

import { Product } from "./schemas";

const { endpoint } = courier();

const products = defineGroup({
  prefix: "products",
  endpoints: {
    get: endpoint.get(":id").response(Product),
    list: endpoint.get("").response(z.array(Product)),
    made: endpoint.get("made").response(made()),
  },
});

function made() {
  return z.object({ id: z.string() });
}

export const shop = defineApi({ baseURL: "https://shop.example", groups: { products } });
`;

const ANSWERS = [
  { id: "p1", price: 12, stock: "3", seller: { name: "Ada", rating: 5 }, rating: 4 },
  { id: "p2", price: "12.5", stock: "1", rating: 3 },
  { id: "p3", price: 10, stock: "0", seller: { name: "Bo" } },
];

let root: string;
let answers: AnswerObservations;
let running: LoadedCourierConfig;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-schema-fix-"));
  symlinkSync(
    resolve(import.meta.dirname, "../../../../node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop", type: "module" }));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/schemas.ts"), SCHEMAS);
  writeFileSync(join(root, "src/shop.ts"), SHOP);
  writeFileSync(
    join(root, "courier.config.ts"),
    `import { defineConfig } from "@noverax/courier/config";\nimport { shop } from "./src/shop";\n\nexport default defineConfig({ sources: { shop } });\n`,
  );
  const db = new DatabaseSync(":memory:");
  migrate(db);
  answers = createAnswerObservations(db);
  for (const answer of ANSWERS) observe("products.get", answer);
  observe("products.made", { id: "m1", extra: true });
  running = await loadCourierConfig(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function observe(endpoint: string, answer: unknown): void {
  answers.observe({
    source: "shop",
    endpoint,
    ...answerShapeOf(answer),
    place: "shop.example",
    at: 1000,
  });
}

/* The reload chain as an edit holds it, loading the project from disk as Studio does. */
function chain(load: () => Promise<LoadedCourierConfig> = () => loadCourierConfig(root)) {
  let current: LoadedCourierConfig = running;
  const acknowledged: string[] = [];
  const tx: ExclusiveContext = {
    current: () => current,
    load,
    apply: (loaded) => {
      current = loaded;
    },
    acknowledge: (paths) => acknowledged.push(...paths),
    reloadAfter: () => {},
  };
  return { tx, acknowledged, current: () => current };
}

const schemas = () => readFileSync(join(root, "src/schemas.ts"), "utf8");
const deps = () => ({ answers, root, applied: new Map<string, AppliedFix>() });

describe("a schema fix, planned", () => {
  it("changes the schema where it is written, through the config, its groups and an import", async () => {
    const plan = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.get",
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.files.map((file) => file.file)).toEqual(["src/schemas.ts"]);
    expect(plan.fixed.slice().sort()).toEqual([
      "price",
      "rating",
      "seller",
      "seller.rating",
      "stock",
    ]);
    expect(plan.left).toEqual([]);
    const after = plan.files[0]?.after ?? "";
    expect(after).toContain(
      "export const Seller = z.object({\n  name: z.string(),\n  rating: z.number().optional(),\n});",
    );
    expect(after).toContain("  price: z.union([z.number().int(), z.string()]).optional(),");
    expect(after).toContain("  stock: z.string(),");
    expect(after).toContain("  seller: Seller.optional(),\n  rating: z.number().optional(),\n});");
    const shown = plan.files[0]?.hunks.flatMap((hunk) => hunk.lines) ?? [];
    expect(shown).toContainEqual(
      expect.objectContaining({ kind: "remove", text: "  stock: z.number()," }),
    );
    expect(shown).toContainEqual(
      expect.objectContaining({ kind: "add", text: "  stock: z.string()," }),
    );
    expect(schemas()).toBe(SCHEMAS);
  });

  it("finds a list's items, and says why it writes nothing for a schema it cannot read", async () => {
    observe("products.list", [
      { id: "p1", price: 1, stock: 2, seller: { name: "Ada" }, rating: 4 },
    ]);

    const list = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.list",
    });
    const made = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.made",
    });
    const fitting = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.nothing",
    });

    expect(list.status === "ready" && list.files[0]?.after).toContain(
      "  seller: Seller,\n  rating: z.number(),\n});",
    );
    expect(made).toEqual({
      status: "manual",
      reason: "Studio could not place a change in shop.products.made's schema.",
      left: [{ path: "extra", why: "the schema is built by an expression Studio does not read" }],
    });
    expect(fitting).toMatchObject({
      status: "manual",
      reason: expect.stringContaining("no record"),
    });
  });
});

describe("a schema fix, applied", () => {
  it("writes the change, runs the config again, and fits the answers; undo takes it back", async () => {
    const plan = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.get",
    });
    const { tx, acknowledged, current } = chain();
    const fixDeps = deps();

    const outcome = await applySchemaFix(tx, fixDeps, {
      source: "shop",
      endpoint: "products.get",
      digest: plan.status === "ready" ? plan.digest : "",
    });

    expect(outcome).toMatchObject({ status: "applied", files: ["src/schemas.ts"], left: [] });
    expect(acknowledged).toEqual([realpathSync(join(root, "src/schemas.ts"))]);
    const fitted = contractReport(current().config.sources, answers).find(
      (entry) => entry.endpoint === "products.get",
    );
    expect(fitted?.state).toBe("confirmed");
    expect(schemas()).toContain("stock: z.string()");

    const undone = await undoSchemaFix(chain().tx, fixDeps, {
      source: "shop",
      endpoint: "products.get",
    });

    expect(undone).toEqual({ status: "undone", files: ["src/schemas.ts"] });
    expect(schemas()).toBe(SCHEMAS);
    expect(
      await undoSchemaFix(chain().tx, fixDeps, { source: "shop", endpoint: "products.get" }),
    ).toMatchObject({
      status: "manual",
    });
  });

  it("applies nothing but the plan reviewed", async () => {
    const outcome = await applySchemaFix(chain().tx, deps(), {
      source: "shop",
      endpoint: "products.get",
      digest: "another plan",
    });

    expect(outcome).toMatchObject({ status: "stale", preview: { status: "ready" } });
    expect(schemas()).toBe(SCHEMAS);
  });

  it("puts the files back when the config does not load, or the change does not reach the schema", async () => {
    const plan = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.get",
    });
    const digest = plan.status === "ready" ? plan.digest : "";
    const request = { source: "shop", endpoint: "products.get", digest };

    const broken = await applySchemaFix(
      chain(() => Promise.reject(new Error("boom"))).tx,
      deps(),
      request,
    );
    expect(broken).toMatchObject({
      status: "manual",
      reason: expect.stringContaining("did not load"),
    });
    expect(schemas()).toBe(SCHEMAS);

    const unreached = await applySchemaFix(
      chain(() => Promise.resolve(running)).tx,
      deps(),
      request,
    );
    expect(unreached).toMatchObject({
      status: "manual",
      reason: expect.stringContaining("did not reach"),
    });
    expect(schemas()).toBe(SCHEMAS);
  });

  it("leaves a file a person changed since the fix to them, rather than undo over their edit", async () => {
    const plan = await planSchemaFix(running, answers, root, {
      source: "shop",
      endpoint: "products.get",
    });
    const fixDeps = deps();
    await applySchemaFix(chain().tx, fixDeps, {
      source: "shop",
      endpoint: "products.get",
      digest: plan.status === "ready" ? plan.digest : "",
    });
    const edited = `${schemas()}\n// mine\n`;
    writeFileSync(join(root, "src/schemas.ts"), edited);

    const undone = await undoSchemaFix(chain().tx, fixDeps, {
      source: "shop",
      endpoint: "products.get",
    });

    expect(undone).toMatchObject({
      status: "manual",
      reason: expect.stringContaining("changed after Studio fixed"),
    });
    expect(schemas()).toBe(edited);
  });
});
