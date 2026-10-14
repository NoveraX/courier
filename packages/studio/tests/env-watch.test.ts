/**
 * Studio reads the project's variables again when its env files change,
 * and its config with them: a source whose address comes from `.env.local`
 * takes the new address as soon as the file is saved, a file made after
 * Studio started counts, and a save that changes no variable reloads
 * nothing.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";
import { createProjectEnv } from "../src/server/project-env";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let root: string;
let watcher: ConfigWatcher | null = null;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-env-watch-")));
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
  write("courier.config.ts", [
    'import { defineApi } from "@noverax/courier/define";',
    "export default {",
    "  sources: {",
    '    shop: defineApi({ name: "shop", baseURL: process.env.COURIER_TEST_ENV_URL + "/shop", endpoints: {} }),',
    "  },",
    "};",
  ]);
});

afterEach(() => {
  watcher?.stop();
  watcher = null;
  Reflect.deleteProperty(process.env, "COURIER_TEST_ENV_URL");
  rmSync(root, { recursive: true, force: true });
});

function write(file: string, lines: string[]): void {
  writeFileSync(join(root, file), `${lines.join("\n")}\n`);
}

async function until(condition: () => boolean, budgetMs = 10_000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

function start(): LoadedCourierConfig[] {
  const applied: LoadedCourierConfig[] = [];
  watcher = startConfigWatcher({
    projectRoot: root,
    current: () => applied.at(-1) ?? null,
    onApplied: (loaded) => applied.push(loaded),
    onFailed: () => {},
    env: createProjectEnv(root),
  });
  return applied;
}

const addressOf = (loaded: LoadedCourierConfig | undefined) =>
  loaded?.config.sources.shop?.options?.baseURL;

describe("a project's env files, watched", () => {
  it("reload the config with the address a saved .env.local gives", async () => {
    write(".env.local", ["COURIER_TEST_ENV_URL=https://a.example.com"]);
    const applied = start();
    await until(() => applied.length === 1);

    write(".env.local", ["COURIER_TEST_ENV_URL=https://b.example.com"]);
    await until(() => applied.length === 2);

    expect(applied.map(addressOf)).toEqual([
      "https://a.example.com/shop",
      "https://b.example.com/shop",
    ]);
  });

  it("count a file made after Studio started", async () => {
    write(".env", ["COURIER_TEST_ENV_URL=https://from-env.example.com"]);
    const applied = start();
    await until(() => applied.length === 1);

    write(".env.local", ["COURIER_TEST_ENV_URL=https://from-local.example.com"]);
    await until(() => applied.length === 2);

    expect(addressOf(applied.at(-1))).toBe("https://from-local.example.com/shop");
  });

  it("reload nothing for a save that changes no variable", async () => {
    write(".env.local", ["COURIER_TEST_ENV_URL=https://a.example.com"]);
    const applied = start();
    await until(() => applied.length === 1);

    write(".env.local", [
      "# the address of the staging API",
      "COURIER_TEST_ENV_URL=https://a.example.com",
    ]);
    expect(await watcher?.catchUp(Date.now() + 5_000)).toBe(true);

    expect(applied).toHaveLength(1);
  });
});
