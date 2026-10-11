/**
 * @vitest-environment node
 *
 * A config loaded again whenever a file it depends on is saved: the config
 * and the project's modules it reaches are followed, a save that changes no
 * byte reloads nothing, a burst of saves is one reload, and a save that
 * breaks the config leaves the last good one in force until one mends it.
 */
import { mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadCourierConfigFile } from "../src/runtime/load-config";
import { type ReloadOnSave, reloadOnSave } from "../src/runtime/reload-on-save";

const projects: string[] = [];
const followers: ReloadOnSave[] = [];

afterEach(() => {
  for (const follower of followers.splice(0)) follower.close();
  for (const dir of projects.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const api = (offer: string) => `export const offer = ${JSON.stringify(offer)};\n`;
const CONFIG = `import { offer } from "./api";\nexport default { sources: {}, agents: { offer } };\n`;

async function project() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-reload-on-save-")));
  projects.push(dir);
  writeFileSync(join(dir, "api.ts"), api("marked"));
  writeFileSync(join(dir, "courier.config.ts"), CONFIG);
  /* Late creation notifications of the fixture itself must not pass for a save. */
  await new Promise((resolve) => setTimeout(resolve, 300));
  const modules = new Set<string>();
  const configFile = join(dir, "courier.config.ts");
  await loadCourierConfigFile(configFile, { onModule: (file) => modules.add(file) });
  const offers: unknown[] = [];
  followers.push(reloadOnSave(configFile, modules, (config) => offers.push(config.agents?.offer)));
  return { dir, modules, offers };
}

async function until(check: () => boolean, ms = 4000): Promise<void> {
  const started = Date.now();
  while (!check() && Date.now() - started < ms) await new Promise((r) => setTimeout(r, 25));
}

describe("a config loaded again on a save", () => {
  it("follows the config and the modules it reaches, and loads it again when one changes", async () => {
    const { dir, modules, offers } = await project();

    writeFileSync(join(dir, "api.ts"), api("reads"));
    await until(() => offers.length > 0);

    expect([...modules].sort()).toEqual([join(dir, "api.ts"), join(dir, "courier.config.ts")]);
    expect(offers).toEqual(["reads"]);
  });

  it("reloads nothing for a save that changes no byte, and once for a burst of saves", async () => {
    const { dir, offers } = await project();

    const later = new Date(Date.now() + 5000);
    utimesSync(join(dir, "api.ts"), later, later);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(offers).toEqual([]);

    for (const offer of ["all", "reads", "all"]) writeFileSync(join(dir, "api.ts"), api(offer));
    await until(() => offers.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(offers).toEqual(["all"]);
  });

  it("keeps the last good config while a save breaks it, and loads the one that mends it", async () => {
    const { dir, offers } = await project();

    writeFileSync(join(dir, "api.ts"), "export const offer = ;\n");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(offers).toEqual([]);

    writeFileSync(join(dir, "api.ts"), api("all"));
    await until(() => offers.length > 0);
    expect(offers).toEqual(["all"]);
  });
});
