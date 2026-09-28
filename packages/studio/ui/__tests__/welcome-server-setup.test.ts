/**
 * The server step of each setup guide on Studio's welcome page, built for
 * production the way the framework builds its server, then started the way it
 * is deployed: with only the packages the guide installs as dependencies.
 *
 * The guides installed the runtime with `npm install -D` while their server
 * snippets imported it, so a production install, which leaves dev
 * dependencies out, could not start: React Router's server stopped at
 * "Cannot find package '@noverax/courier-studio-core'".
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Rollup } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import type { FrameworkConfig } from "../src/views/welcome/frameworks-types";

import { FRAMEWORKS } from "../src/views/welcome/frameworks";

const WORKSPACE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

/** What the frameworks' own modules give a production server build. */
const FRAMEWORK_MODULES = new Map([
  ["$app/environment", "export const dev = false;"],
  ["astro:middleware", "export const defineMiddleware = (handler) => handler;"],
]);

/** Starts the server module as its framework would: Nitro runs a plugin, Next.js calls `register`. */
const START_SERVER = `globalThis.defineNitroPlugin = (plugin) => plugin;
const server = await import("./server.mjs");
if (typeof server.register === "function") await server.register();
if (typeof server.default === "function") await server.default({});
`;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function temporaryDirectory(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-welcome-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function serverSnippet(framework: FrameworkConfig): string {
  const code = framework.steps.find((step) => step.id === "instrument-server")?.code;
  if (code === undefined) throw new Error(`${framework.name} has no server step`);
  return code;
}

/** The packages the guide's install step adds as dependencies, not dev dependencies. */
function productionPackages(framework: FrameworkConfig): string[] {
  const install = framework.steps.find((step) => step.id === "install")?.code ?? "";
  return install
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([tool, command]) => tool === "npm" && command === "install")
    .filter((words) => !words.includes("-D") && !words.includes("--save-dev"))
    .flatMap((words) => words.slice(2));
}

/** Builds a server module for production the way Vite does for SvelteKit, Astro and the rest. */
async function buildForProduction(code: string): Promise<string> {
  const root = temporaryDirectory();
  writeFileSync(join(root, "server.ts"), code);
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    mode: "production",
    /* Nitro's production value of its own flag. */
    define: { "import.meta.dev": "false" },
    plugins: [
      {
        name: "framework-modules",
        resolveId: (id) => (FRAMEWORK_MODULES.has(id) ? `\0${id}` : undefined),
        load: (id) => FRAMEWORK_MODULES.get(id.slice(1)),
      },
    ],
    build: {
      ssr: join(root, "server.ts"),
      write: false,
      rollupOptions: { external: [/^@noverax\//] },
    },
  });
  const [output] = Array.isArray(result) ? result : [result as Rollup.RollupOutput];
  return output?.output.map((chunk) => ("code" in chunk ? chunk.code : "")).join("\n") ?? "";
}

/** Deploys a server with the given packages installed, and starts it in production. */
function startInProduction(server: string, packages: string[]) {
  const dir = temporaryDirectory();
  mkdirSync(join(dir, "node_modules", "@noverax"), { recursive: true });
  for (const name of packages) {
    symlinkSync(join(WORKSPACE_MODULES, name), join(dir, "node_modules", name), "dir");
  }
  writeFileSync(join(dir, "server.mjs"), server);
  writeFileSync(join(dir, "start.mjs"), START_SERVER);
  return spawnSync(process.execPath, ["start.mjs"], {
    cwd: dir,
    encoding: "utf-8",
    env: { ...process.env, NODE_ENV: "production", NEXT_RUNTIME: "nodejs" },
    timeout: 30_000,
  });
}

const WITH_SERVER_STEP = FRAMEWORKS.filter((framework) =>
  framework.steps.some((step) => step.id === "instrument-server"),
).map((framework) => [framework.name, framework] as const);

describe("the welcome page's server setup", () => {
  it.each(WITH_SERVER_STEP)(
    "%s starts in production with only the dependencies its guide installs",
    async (_name, framework) => {
      const server = await buildForProduction(serverSnippet(framework));

      const result = startInProduction(server, productionPackages(framework));

      expect(result.stderr).not.toMatch(/Cannot find (package|module)/);
      expect(result.status).toBe(0);
    },
  );
});
