/**
 * The command as a person runs it, on projects made for each case: what it
 * prints, what it writes, and how it exits. Nothing is installed: `--no-install`
 * names the commands instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));

/* The release the command installs Courier's packages at: its own. */
const VERSION: unknown = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")).version;

/* One of Courier's packages as the command names it: at its release, bare from a build with none. */
function released(name: string): string {
  return VERSION === "0.0.0" ? name : `${name}@^${String(VERSION)}`;
}

function run(args: readonly string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: PACKAGE,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", npm_config_user_agent: "" },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const NEXT = {
  "package.json": manifest({ next: "16.4.0", react: "19.2.0", typescript: "^6.0.3" }),
  "tsconfig.json": "{}",
  "src/app/page.tsx": "export default function Home() { return null; }\n",
};

/* A Next.js app that lists every package the setup installs, so only files and scripts are left. */
const NEXT_WITH_PACKAGES = {
  ...NEXT,
  "package.json": manifest(
    Object.fromEntries(
      [
        "next",
        "react",
        "typescript",
        "@noverax/courier",
        "@noverax/courier-next",
        "@noverax/courier-react",
        "@tanstack/react-query",
        "zod",
        "@noverax/courier-studio-core",
        "@noverax/courier-studio",
        "@noverax/courier-cli",
        "@noverax/courier-mock",
        "hono",
        "@hono/node-server",
      ].map((name) => [name, name === "typescript" ? "^6.0.3" : name === "next" ? "16.4.0" : "*"]),
    ),
  ),
};

describe("create-courier", () => {
  it("shows the plan and changes nothing with --dry-run", () => {
    const root = projectWith(NEXT);
    const before = readdirSync(root);

    const { status, out } = run([root, "--dry-run", "--no-mcp"]);

    expect(status).toBe(0);
    expect(out).toContain("Set Courier up in app (Next.js 16.4.0, npm)");
    expect(out).toContain("+ src/instrumentation.ts");
    expect(out).toContain("~ package.json");
    expect(readdirSync(root)).toEqual(before);
  }, 60_000);

  it("changes nothing without --yes where no one can answer", () => {
    const root = projectWith(NEXT);

    const { status, out } = run([root, "--no-mcp"]);

    expect(status).toBe(1);
    expect(out).toContain("Nothing was changed: run it again with --yes");
    expect(existsSync(join(root, "courier.config.ts"))).toBe(false);
  }, 60_000);

  it("writes the files and the script with --yes, names the installs with --no-install, and has nothing left to do the second time", () => {
    const root = projectWith(NEXT_WITH_PACKAGES);

    const first = run([root, "--yes", "--no-install", "--no-mcp"]);
    const again = run([root, "--yes", "--no-install", "--no-mcp"]);

    expect(first.status).toBe(0);
    expect(first.out).toContain("Wrote 9 files, and changed package.json.");
    expect(readFileSync(join(root, "src/instrumentation.ts"), "utf8")).toContain(
      "registerSources(config.sources);",
    );
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts).toEqual({
      studio: "courier-studio",
      routes: "courier-cli routes",
    });
    expect(again.status).toBe(0);
    expect(again.out).toContain(
      "Courier is set up here already: courier.config.ts declares 1 API (api).",
    );
    expect(again.out).toContain("Nothing is missing.");
    expect(again.out).not.toContain("Left to you");
  }, 60_000);

  it("names the install commands with --no-install, and does not call Courier set up before they run", () => {
    const root = projectWith(NEXT);

    const { status, out } = run([root, "--yes", "--no-install", "--no-mcp"]);

    expect(status).toBe(0);
    expect(out).toContain("Install the packages to finish:");
    expect(out).toContain(
      `npm install ${released("@noverax/courier")} ${released("@noverax/courier-next")}`,
    );
    expect(out).not.toContain("Courier is set up.");
    expect(out).toContain("npm run studio");
  }, 60_000);

  it("adds the MCP server's entry for the editor with --mcp", () => {
    const root = projectWith(NEXT);

    run([root, "--yes", "--no-install", "--mcp"]);

    expect(JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"))).toEqual({
      mcpServers: { courier: { command: "npx", args: ["@noverax/courier-mcp"] } },
    });
    expect(readFileSync(join(root, "src/courier/api.ts"), "utf8")).toContain('access: "read"');
    expect(readFileSync(join(root, "courier.config.ts"), "utf8")).toContain(
      '  agents: { offer: "reads" },',
    );
  }, 60_000);

  it("adds agents to a project set up already: the MCP server's entry, and the reads offered in its config, without the example's lines", () => {
    const root = projectWith(NEXT_WITH_PACKAGES);
    run([root, "--yes", "--no-install", "--no-mcp"]);

    const { status, out } = run([root, "--yes", "--no-install", "--mcp"]);

    expect(status).toBe(0);
    expect(out).toMatch(/= courier\.config\.ts +Courier's already, yours to change/);
    expect(out).not.toContain("src/courier/api.ts");
    expect(out).not.toContain("const users = defineGroup(");
    expect(out).toContain(
      "Your editor's agent can call the API's reads, as courier.config.ts offers them",
    );
    expect(readFileSync(join(root, "courier.config.ts"), "utf8")).toContain(
      '  agents: { offer: "reads" },',
    );
    expect(existsSync(join(root, ".mcp.json"))).toBe(true);
  }, 60_000);

  it("refuses a project without TypeScript, a framework it does not know, and a folder of files without package.json", () => {
    const noTs = run([projectWith({ "package.json": manifest({ next: "16.4.0" }) }), "--dry-run"]);
    const unknown = run([
      projectWith({ "package.json": manifest({ lodash: "4" }), "tsconfig.json": "{}" }),
      "--dry-run",
    ]);
    const loose = run([projectWith({ "notes.txt": "" }), "--dry-run"]);

    expect(noTs.status).toBe(1);
    expect(noTs.out).toContain("add TypeScript first");
    expect(unknown.out).toContain("No framework Courier sets up was found in package.json");
    expect(loose.out).toContain("holds files but no package.json");
  }, 60_000);

  it("shows how a new project would be made in an empty folder, and makes nothing with --dry-run", () => {
    const root = join(projectWith({ "README.md": "" }), "shop");

    const { status, out } = run([root, "--framework", "next", "--dry-run"]);

    expect(status).toBe(0);
    expect(out).toContain("Create shop with Next.js, then set Courier up in it");
    expect(out).toContain("npx --yes create-next-app@16 shop --yes --use-npm");
    expect(existsSync(root)).toBe(false);
  }, 60_000);

  it("asks for the framework of a new project where no one can answer", () => {
    const root = join(projectWith({ "README.md": "" }), "shop");

    const { status, out } = run([root, "--yes"]);

    expect(status).toBe(1);
    expect(out).toContain("Name the framework to create the project with: --framework next|nuxt");
  }, 60_000);

  it("refuses a specification file that is not there before it creates anything", () => {
    const root = join(projectWith({ "README.md": "" }), "shop");

    const { status, out } = run([
      root,
      "--framework",
      "express",
      "--yes",
      "--openapi",
      "./no-such-spec.json",
    ]);

    expect(status).toBe(1);
    expect(out).toContain("--openapi: there is no ./no-such-spec.json here");
    expect(existsSync(root)).toBe(false);
  }, 60_000);

  it("explains the folder it takes and shows how it is run in its help", () => {
    const { status, out } = run(["--help"]);

    expect(status).toBe(0);
    expect(out).toContain("Usage\n    create-courier [dir] [options]");
    expect(out).toMatch(/Arguments\n {4}\[dir\] +The project's folder, or a new one to create/);
    expect(out).toMatch(
      /Examples\n {4}create-courier +Set Courier up in the project in this folder/,
    );
    expect(out).toMatch(/create-courier shop +Create shop with the framework you pick/);
  }, 60_000);

  it("refuses options it cannot follow", () => {
    const root = projectWith(NEXT);

    expect(run([root, "--dry-run", "--framework", "angular"]).out).toContain(
      "--framework takes next, nuxt",
    );
    expect(run([root, "--dry-run", "--package-manager", "deno"]).out).toContain(
      "--package-manager takes npm, pnpm, yarn or bun",
    );
    expect(run([root, "--dry-run", "--openapi", "spec.json", "--no-studio"]).out).toContain(
      "leave out --no-studio",
    );
  }, 60_000);
});
