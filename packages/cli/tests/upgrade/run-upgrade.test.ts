/**
 * An upgrade carried out against a registry and an install of the tests'
 * own: what it plans, writes and installs, what it puts back when the
 * install fails, and what it refuses before it changes anything.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackageManager, PlanView, SetupEnd } from "@noverax/create-courier/engine";
import { afterAll, describe, expect, it } from "vitest";

import type { Published } from "../../src/upgrade/registry";
import { runUpgrade, type UpgradeRun } from "../../src/upgrade/run-upgrade";
import { manifest, projectWith, removeProjects } from "../helpers/temp-project";

afterAll(removeProjects);

const FAKE = fileURLToPath(new URL("./fake-install.mjs", import.meta.url));

/* A package manager whose install behaves as the case says. */
function fakeManager(behaviour: "ok" | "fail"): PackageManager {
  return {
    name: "npm",
    add: (packages) => ["npm", "install", ...packages],
    run: (script) => `npm run ${script}`,
    exec: (bin, args) => ["npm", "exec", "--", bin, ...args],
    install: () => [process.execPath, FAKE, behaviour],
  };
}

/* A registry that publishes every package at each version it is given, with the Node.js each asks for. */
function registryOf(versions: Readonly<Record<string, Published | undefined>>) {
  return () => ({
    async published(spec: string) {
      const at = spec.lastIndexOf("@");
      const name = spec.slice(0, at);
      const version = spec.slice(at + 1);
      if (version === "latest") return versions.latest;
      return name === "@noverax/gone" ? undefined : versions[version];
    },
  });
}

const PUBLISHED = {
  latest: { version: "0.5.0", node: ">=22" },
  "0.5.0": { version: "0.5.0", node: ">=22" },
};

function shop(extra: Readonly<Record<string, string>> = {}): string {
  return projectWith({
    "package.json": manifest({
      name: "shop",
      dependencies: { "@noverax/courier": "^0.4.0", react: "^19.0.0" },
      devDependencies: { "@noverax/courier-studio": "^0.4.0" },
    }),
    "node_modules/@noverax/courier/package.json": manifest({ version: "0.4.0" }),
    ...extra,
  });
}

async function upgrade(
  root: string,
  run: UpgradeRun,
  {
    install = "ok",
    own = "0.5.0",
    versions = PUBLISHED,
  }: {
    install?: "ok" | "fail";
    own?: string;
    versions?: Readonly<Record<string, Published | undefined>>;
  } = {},
) {
  const plans: PlanView[] = [];
  const ends: SetupEnd[] = [];
  const report = {
    newProject: () => undefined,
    note: () => undefined,
    plan: (view: PlanView) => plans.push(view),
    installed: () => undefined,
    wrote: () => undefined,
    prepareFailed: () => undefined,
    typechecked: () => undefined,
    end: (end: SetupEnd) => ends.push(end),
  };
  const status = await runUpgrade(
    { cwd: root, yes: true, ...run },
    { interactive: false, report, toolOutput: "stdout" },
    own,
    { registry: registryOf(versions), manager: () => fakeManager(install) },
  );
  return { status, plan: plans[0], end: ends.at(-1) };
}

const read = (root: string, path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), "utf8"));

describe("runUpgrade", () => {
  it("raises every one of Courier's packages at once, installs once, and names the release's breaking changes", async () => {
    const root = shop();

    const { status, plan, end } = await upgrade(root, {});

    expect(status).toBe(0);
    expect(end).toMatchObject({ kind: "applied", said: "Courier is upgraded to 0.5.0." });
    expect(read(root, "package.json")).toMatchObject({
      dependencies: { "@noverax/courier": "^0.5.0", react: "^19.0.0" },
      devDependencies: { "@noverax/courier-studio": "^0.5.0" },
    });
    expect(read(root, "package-lock.json")).toMatchObject({ listed: { name: "shop" } });
    expect(plan?.title).toBe("Upgrade Courier in shop to 0.5.0 (npm)");
    expect(plan?.upgrade?.from).toBe("0.4.0");
    expect(plan?.upgrade?.notes.map((note) => note.release)).toContain("0.5.0");
    expect(plan?.upgrade?.notes.map((note) => note.release)).not.toContain("0.4.0");
  });

  it("carries the code over the releases it crosses, and adds the package moved code needs", async () => {
    const root = projectWith({
      "package.json": manifest({
        name: "shop",
        dependencies: { "@noverax/courier": "^0.3.1" },
        devDependencies: { "@noverax/courier-studio-core": "^0.3.1" },
      }),
      "node_modules/@noverax/courier/package.json": manifest({ version: "0.3.1" }),
      "scripts/load.ts":
        'import { loadCourierConfig } from "@noverax/courier-studio-core/config";\n',
      "src/live.ts":
        'import { AuthError, createCaller } from "@noverax/courier";\nnew AuthError();\n',
    });

    const { status, plan } = await upgrade(root, {});

    expect(status).toBe(0);
    expect(readFileSync(join(root, "scripts/load.ts"), "utf8")).toBe(
      'import { loadCourierConfig } from "@noverax/courier-build/config";\n',
    );
    expect(readFileSync(join(root, "src/live.ts"), "utf8")).toBe(
      'import { createCaller } from "@noverax/courier";\nimport { AuthError } from "@noverax/courier/realtime";\nnew AuthError();\n',
    );
    expect(read(root, "package.json")).toMatchObject({
      devDependencies: {
        "@noverax/courier-studio-core": "^0.5.0",
        "@noverax/courier-build": "^0.5.0",
      },
    });
    expect(plan?.upgrade?.packages).toContainEqual(
      expect.objectContaining({ name: "@noverax/courier-build", added: true, to: "^0.5.0" }),
    );
    expect(plan?.upgrade?.notes.map((note) => note.release)).toEqual(
      expect.arrayContaining(["0.4.0", "0.5.0"]),
    );
  });

  it("raises the packages of every manifest in the workspace, from one of its packages", async () => {
    const root = shop({
      "apps/web/package.json": manifest({ dependencies: { "@noverax/courier-react": "~0.4.0" } }),
    });
    const before = readFileSync(join(root, "package.json"), "utf8");
    const withWorkspaces = before.replace(
      '"name": "shop",',
      '"name": "shop",\n  "workspaces": ["apps/*"],',
    );
    writeFileSync(join(root, "package.json"), withWorkspaces);

    const { status } = await upgrade(join(root, "apps/web"), {});

    expect(status).toBe(0);
    expect(read(root, "apps/web/package.json")).toEqual({
      dependencies: { "@noverax/courier-react": "~0.5.0" },
    });
    expect(read(root, "package.json")).toMatchObject({
      dependencies: { "@noverax/courier": "^0.5.0" },
    });
  });

  it("shows the plan and changes nothing with --dry-run", async () => {
    const root = shop();
    const before = readFileSync(join(root, "package.json"), "utf8");

    const { status, plan, end } = await upgrade(root, { "dry-run": true });

    expect(status).toBe(0);
    expect(end).toEqual({ kind: "dry-run" });
    expect(plan?.plan.edits.map((edit) => edit.path)).toEqual(["package.json"]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });

  it("puts package.json and the lockfile back as they were when the install fails", async () => {
    const root = shop({ "package-lock.json": "{}\n" });
    const before = readFileSync(join(root, "package.json"), "utf8");

    const { status, end } = await upgrade(root, {}, { install: "fail" });

    expect(status).toBe(1);
    expect(end).toMatchObject({ kind: "failed", code: "INSTALL_FAILED" });
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe("{}\n");
  });

  it("says the project is at the release already where every range is", async () => {
    const root = projectWith({
      "package.json": manifest({ dependencies: { "@noverax/courier": "^0.5.0" } }),
    });

    const { status, end } = await upgrade(root, {});

    expect(status).toBe(0);
    expect(end).toEqual({ kind: "unchanged", said: "Courier is at 0.5.0 already.", next: [] });
  });

  it.each([
    [
      "NO_COURIER",
      () => projectWith({ "package.json": manifest({ dependencies: { react: "^19.0.0" } }) }),
      {},
      {},
    ],
    [
      "DOWNGRADE",
      () => shop(),
      { to: "0.3.0" },
      { versions: { "0.3.0": { version: "0.3.0", node: undefined } } },
    ],
    ["CLI_TOO_OLD", () => shop(), {}, { own: "0.4.0" }],
    [
      "PACKAGE_MISSING_AT_TARGET",
      () => shop({ "package.json": manifest({ dependencies: { "@noverax/gone": "^0.4.0" } }) }),
      {},
      {},
    ],
    [
      "NODE_TOO_OLD",
      () => shop(),
      {},
      {
        versions: {
          latest: { version: "0.5.0", node: ">=99" },
          "0.5.0": { version: "0.5.0", node: ">=99" },
        },
      },
    ],
  ] as const)("refuses %s before it changes anything", async (code, project, run, options) => {
    const root = project();
    const before = readFileSync(join(root, "package.json"), "utf8");

    await expect(upgrade(root, run, options)).rejects.toMatchObject({ code });
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});
