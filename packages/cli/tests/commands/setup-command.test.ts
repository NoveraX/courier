/**
 * `courier-cli setup`: a project that takes its routes from courier.routes.ts
 * moved to the routes Courier's plugin builds in — the plan with
 * `--dry-run`, the changes with `--yes` — through create-courier's setup,
 * which makes the same changes create-courier makes.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCommand } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupCommand } from "../../src/commands/setup-command";

const CALLER = `import { createProxyCaller } from "@noverax/courier";

import { apiRoutes } from "../../../courier.routes";

export const courier = createProxyCaller(apiRoutes);
`;

const FILES: Readonly<Record<string, string>> = {
  "package.json": JSON.stringify({
    name: "shop",
    dependencies: {
      "@sveltejs/kit": "^3.0.0",
      "@noverax/courier": "*",
      "@noverax/courier-sveltekit": "*",
    },
    devDependencies: { typescript: "^6.0.3", "@noverax/courier-build": "*" },
  }),
  "tsconfig.json": "{}",
  "vite.config.ts":
    'import { sveltekit } from "@sveltejs/kit/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [sveltekit()] });\n',
  "courier.config.ts":
    'import { api } from "./src/lib/courier/api";\n\nexport default defineConfig({ sources: { api } });\n',
  "courier.routes.ts":
    '// Written by Courier from courier.config.ts. Do not edit it:\nexport const apiRoutes = {\n  source: "api",\n  endpoints: {},\n};\n',
  "src/lib/courier/caller.ts": CALLER,
};

let dir: string;
let printed: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-setup-command-"));
  for (const [path, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  printed = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    printed += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(join(dir, path), "utf8");

describe("courier-cli setup", () => {
  it("shows the plan and changes nothing with --dry-run", async () => {
    await runCommand(setupCommand, { rawArgs: ["--cwd", dir, "--dry-run"] });

    expect(process.exitCode).toBe(0);
    expect(printed).toContain("Build the pages' routes in with Courier's plugin in shop");
    expect(printed).toContain("~ src/lib/courier/caller.ts");
    expect(read("src/lib/courier/caller.ts")).toBe(CALLER);
  });

  it("moves the client to the plugin's routes and adds the plugin with --yes", async () => {
    await runCommand(setupCommand, { rawArgs: ["--cwd", dir, "--yes", "--no-install"] });

    expect(process.exitCode).toBe(0);
    expect(read("src/lib/courier/caller.ts")).toContain("createProxyCaller(routes.api)");
    expect(read("src/lib/courier/caller.ts")).toContain('declare module "@noverax/courier/routes"');
    expect(read("vite.config.ts")).toContain("plugins: [sveltekit(), courierRoutes()]");
    expect(read("courier.config.ts")).toContain("studio: { routes: false }");
  });

  it("fails with the reason for a project whose framework Courier has no plugin for", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { express: "^5.1.0" } }),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runCommand(setupCommand, { rawArgs: ["--cwd", dir, "--dry-run"] });

    expect(process.exitCode).toBe(1);
    expect(errors.mock.calls.flat().join(" ")).toContain(
      "Courier has no plugin for Express's build",
    );
  });
});
