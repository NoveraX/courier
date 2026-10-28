/**
 * @vitest-environment node
 *
 * A project's routes, read in a process started for the one reading, as the
 * built package starts it: the routes of every source, the files and the
 * variables they depended on, and each way a reading fails. Requires a
 * build of this package first, whose worker the process runs.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluateInChild } from "../../src/engine/evaluate-in-child";
import { RoutesReadError } from "../../src/engine/routes-read-error";

/* The repository's packages, where a config's `@noverax/courier` resolves from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

const APIS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  endpoints: { search: endpoint.get("search").expose(process.env.SHOP_SEARCH_PUBLIC === "1") },
  groups: {
    cart: defineGroup({ endpoints: { add: endpoint.post("cart").expose(), view: endpoint.get("cart") } }),
  },
});

export const payments = defineApi({
  baseURL: "https://pay.example.com",
  endpoints: { charge: endpoint.post("charge") },
});
`;

const CONFIG = `import { payments, shop } from "./apis";

export default { sources: { shop, payments } };
`;

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-evaluate-in-child-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function project(config: string = CONFIG): void {
  writeFileSync(join(dir, "apis.ts"), APIS);
  writeFileSync(join(dir, "courier.config.ts"), config);
}

async function failure(promise: Promise<unknown>): Promise<RoutesReadError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof RoutesReadError))
    throw new Error(`expected a RoutesReadError, got ${String(error)}`);
  return error;
}

describe("evaluateInChild", () => {
  it("reads the routes of every source, one that opens nothing to a page among them", async () => {
    project();

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["payments", "shop"]);
    expect(snapshot.routes.payments).toEqual({ source: "payments", endpoints: {} });
    expect(snapshot.routes.shop?.endpoints).toEqual({ "cart.add": { type: "mutation" } });
  }, 30_000);

  it("reads the project's env files before the config, the first that sets a variable winning", async () => {
    project();
    writeFileSync(join(dir, ".env.production"), "SHOP_SEARCH_PUBLIC=1\n");
    writeFileSync(join(dir, ".env"), "SHOP_SEARCH_PUBLIC=0\n");

    const snapshot = await evaluateInChild({
      root: dir,
      envFiles: [join(dir, ".env.production"), join(dir, ".env")],
    });

    expect(Object.keys(snapshot.routes.shop?.endpoints ?? {})).toEqual(["cart.add", "search"]);
  }, 30_000);

  it("names the config, the modules it reached, the env files and the variables it looked at", async () => {
    project();

    const snapshot = await evaluateInChild({ root: dir, envFiles: [join(dir, ".env.local")] });

    expect(snapshot.configFile).toBe(join(dir, "courier.config.ts"));
    expect(snapshot.files).toEqual(
      expect.arrayContaining([
        join(dir, "courier.config.ts"),
        join(dir, "apis.ts"),
        join(dir, ".env.local"),
      ]),
    );
    expect(snapshot.env === "*" || snapshot.env.includes("SHOP_SEARCH_PUBLIC")).toBe(true);
  }, 30_000);

  it("fails CONFIG_NOT_FOUND where no config is in the root or a folder above it", async () => {
    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_FOUND");
    expect(error.message).toContain(dir);
  }, 30_000);

  it("fails CONFIG_NOT_LOADED with what went wrong, for a config that throws", async () => {
    project(`${CONFIG}\nthrow new Error("SHOP_API_KEY is not set");\n`);

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_LOADED");
    expect(error.message).toMatch(/courier\.config\.ts did not load.*SHOP_API_KEY is not set/);
    expect(error.context).toEqual({ root: dir, configFile: join(dir, "courier.config.ts") });
    expect(error.stack).toContain("courier.config.ts");
  }, 30_000);

  it("fails CONFIG_NOT_LOADED for a config that names no sources", async () => {
    project("export default { studio: { port: 6290 } };\n");

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_LOADED");
    expect(error.message).toContain("exports no `sources`");
    expect(error.context.configFile).toBe(join(dir, "courier.config.ts"));
  }, 30_000);

  it("gives up a config that never finishes loading, ROUTES_NOT_READ", async () => {
    project(`${CONFIG}\nwhile (true) {}\n`);

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }, 1_500));

    expect(error.code).toBe("ROUTES_NOT_READ");
    expect(error.message).toContain("given up");
  }, 30_000);

  it("answers whatever the config leaves running, and ends its process", async () => {
    project(`${CONFIG}\nsetInterval(() => {}, 1_000);\n`);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["payments", "shop"]);
  }, 30_000);
});
