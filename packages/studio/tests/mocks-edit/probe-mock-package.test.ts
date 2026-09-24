/**
 * Loading the mock package the way a mocks file would. A project under the
 * repository's node_modules resolves the workspace's `@noverax/courier-mock`;
 * one in the system's temporary directory resolves only what it installs.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { probeMockPackage } from "../../src/server/mocks-edit/probe-mock-package";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";

const REPO_CACHE = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");
const NOTHING_THROWN = Symbol("nothing thrown");

const cleanups: string[] = [];

function projectIn(parent: string): string {
  mkdirSync(parent, { recursive: true });
  const dir = realpathSync(mkdtempSync(join(parent, "probe-mock-package-")));
  cleanups.push(dir);
  return dir;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

/* A tsconfig that maps the whole scope to the project's sources, and a
   source file there that says when it runs. */
function aliasScopeToSources(project: string): string {
  const marker = join(project, "evaluated");
  mkdirSync(join(project, "src"));
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@noverax/*": ["./src/*"] } } }),
  );
  writeFileSync(
    join(project, "src", "courier-mock.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "");\nexport const defineMocks = (m: unknown) => m;\nexport const defineMockServer = (m: unknown) => m;\n`,
  );
  return marker;
}

function installFakeMockPackage(project: string, source: string): void {
  const dir = join(project, "node_modules", "@noverax", "courier-mock");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "@noverax/courier-mock", type: "module", exports: "./index.js" }),
  );
  writeFileSync(join(dir, "index.js"), source);
}

afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("probeMockPackage", () => {
  it("resolves in a project that can import the package", async () => {
    const project = projectIn(REPO_CACHE);

    expect(await rejectionOf(probeMockPackage(project))).toBe(NOTHING_THROWN);
  });

  it("does not evaluate the project's own files", async () => {
    const project = projectIn(REPO_CACHE);
    const marker = join(project, "evaluated");
    const sideEffect = `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "");\nexport default {};\n`;
    writeFileSync(join(project, "courier.mocks.ts"), sideEffect);
    writeFileSync(join(project, "courier.config.ts"), sideEffect);

    await probeMockPackage(project);

    expect(existsSync(marker)).toBe(false);
  });

  it("refuses when the package cannot be found, giving npm's install command", async () => {
    const project = projectIn(tmpdir());

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toBeInstanceOf(MocksEditRefusal);
    expect(error).toMatchObject({
      code: "MOCK_PACKAGE_UNLOADABLE",
      message:
        "Studio could not load @noverax/courier-mock in this project: Cannot find module '@noverax/courier-mock'. Install it with npm install --save-dev @noverax/courier-mock hono @hono/node-server, then ask again.",
      cause: { code: "MODULE_NOT_FOUND" },
      retryable: false,
    });
  });

  it("refuses a package without defineMockServer, giving the project's own install command", async () => {
    const project = projectIn(tmpdir());
    installFakeMockPackage(project, "export const defineMocks = (mocks) => mocks;\n");
    writeFileSync(join(project, "pnpm-lock.yaml"), "");

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toMatchObject({
      code: "MOCK_PACKAGE_UNLOADABLE",
      message:
        "Studio could not load @noverax/courier-mock in this project: it does not export defineMockServer. Install it with pnpm add -D @noverax/courier-mock hono @hono/node-server, then ask again.",
    });
  });

  it("names every export a mocks file needs that the package lacks", async () => {
    const project = projectIn(tmpdir());
    installFakeMockPackage(project, "export const defineMockServer = 1;\n");

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toMatchObject({
      message: expect.stringContaining(": it does not export defineMockServer or defineMocks. "),
    });
  });

  it("refuses a package that throws while loading, with the first line of its error", async () => {
    const project = projectIn(tmpdir());
    installFakeMockPackage(project, 'throw new Error("hono is missing.\\n    at somewhere");\n');

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toMatchObject({
      code: "MOCK_PACKAGE_UNLOADABLE",
      message:
        "Studio could not load @noverax/courier-mock in this project: hono is missing. Install it with npm install --save-dev @noverax/courier-mock hono @hono/node-server, then ask again.",
    });
  });

  it("loads the installed package, not a project file a tsconfig alias maps its scope to", async () => {
    const project = projectIn(REPO_CACHE);
    const marker = aliasScopeToSources(project);

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toBe(NOTHING_THROWN);
    expect(existsSync(marker)).toBe(false);
  });

  it("refuses a package that only a tsconfig alias provides, without running the file it maps to", async () => {
    const project = projectIn(tmpdir());
    const marker = aliasScopeToSources(project);

    const error = await rejectionOf(probeMockPackage(project));

    expect(error).toMatchObject({ code: "MOCK_PACKAGE_UNLOADABLE" });
    expect(existsSync(marker)).toBe(false);
  });

  it("names files in its message relative to the project, on one line", async () => {
    const project = projectIn(tmpdir());
    const where = join(project, "node_modules", "@noverax", "courier-mock", "index.js");
    installFakeMockPackage(
      project,
      `throw new Error(${JSON.stringify(`broken   in ${where}`)});\n`,
    );

    const error = await rejectionOf(probeMockPackage(project));

    const message = String(Reflect.get(Object(error), "message"));
    expect(message).toContain(
      ": broken in node_modules/@noverax/courier-mock/index.js. Install it with",
    );
    expect(message).not.toContain(project);
    expect(message).not.toContain("\n");
  });
});
