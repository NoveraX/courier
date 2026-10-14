/**
 * The routes module Courier writes, compiled as a page compiles it: it holds
 * to the API it was written from under the strictest settings, with the
 * project's imports resolved by a bundler or as Node does; it types a proxy
 * client with the endpoints it names alone; and a module the API no longer
 * matches does not compile.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadCourierConfig } from "@noverax/courier-studio-core/config";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projectRootAt } from "../../src/project-fs/project-root";
import { composeRoutesModule } from "../../src/routes-module/compose-routes-module";
import { writeRoutesModule } from "../../src/routes-module/write-routes-module";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

const STRICTEST: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
  types: [],
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
};

const BUNDLER = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
const NODE = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };

const API = `
import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint, stream } = courier();

export const api = defineApi({
  baseURL: "https://api.example.com",
  groups: {
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        list: endpoint.get("").response<{ id: number }[]>().cache({ revalidate: 30 }).expose(),
        create: endpoint.post("").variables<{ item: string }>().response<{ id: number }>().expose(),
        purge: endpoint.del("").expose(false),
        feed: stream.get("feed").response<{ id: number }>().expose(),
      },
    }),
  },
});
`;

const PAGE = (routes: string) => `
import { createProxyCaller } from "@noverax/courier";
import { apiRoutes } from "${routes}";

const client = createProxyCaller(apiRoutes);

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const listTyped: Equal<ReturnType<typeof client.orders.list>, Promise<{ id: number }[]>> = true;
export const createTyped: Equal<Parameters<typeof client.orders.create>[0], { item: string }> = true;
// @ts-expect-error — the routes do not name orders.purge
export const purged = client.orders.purge();
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-routes-typecheck-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "api.ts"), API);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function writeProject(nodeResolution: boolean): Promise<string> {
  const extension = nodeResolution ? ".js" : "";
  writeFileSync(
    join(dir, "courier.config.ts"),
    `import { defineConfig } from "@noverax/courier/config";\nimport { api } from "./src/api${extension}";\n\nexport default defineConfig({ sources: { api } });\n`,
  );
  if (nodeResolution) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "NodeNext" } }),
    );
  }
  const loaded = await loadCourierConfig({ cwd: dir, requireAtCwd: true });
  if (loaded === null) throw new Error("no courier.config was loaded");
  const { module } = composeRoutesModule(dir, loaded, "src/courier.routes.ts");
  if (module === null) throw new Error("no routes module was composed");
  await writeRoutesModule(projectRootAt(dir), module);
  writeFileSync(join(dir, "src", "page.ts"), PAGE(`./courier.routes${extension}`));
  return join(dir, "src", "page.ts");
}

function diagnostics(file: string, options: ts.CompilerOptions): string[] {
  const program = ts.createProgram([file], options);
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (d) => `${d.file?.fileName ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
    );
}

describe("the routes module Courier writes", () => {
  it("compiles where a bundler resolves the project's imports, and types the client by it", async () => {
    const page = await writeProject(false);

    expect(diagnostics(page, { ...STRICTEST, ...BUNDLER })).toEqual([]);
  }, 30_000);

  it("compiles where the project's imports resolve as Node does", async () => {
    const page = await writeProject(true);

    expect(readFileSync(join(dir, "src", "courier.routes.ts"), "utf8")).toContain(
      'import type config from "../courier.config.js";',
    );
    expect(diagnostics(page, { ...STRICTEST, ...NODE })).toEqual([]);
  }, 30_000);

  it("does not compile once the API no longer defines a path it names", async () => {
    const page = await writeProject(false);
    const routes = join(dir, "src", "courier.routes.ts");
    writeFileSync(
      routes,
      readFileSync(routes, "utf8").replace(
        '"orders.list":',
        '"orders.gone": { type: "query" },\n  "orders.list":',
      ),
    );

    expect(diagnostics(page, { ...STRICTEST, ...BUNDLER }).join("\n")).toContain("orders.gone");
  }, 30_000);
});
