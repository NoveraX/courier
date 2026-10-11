/**
 * The Studios the Courier view shows: each project's own — the address in
 * its own `.courier/studio.json`, kept while that Studio answers — or the
 * one the settings name, alone. A Studio the hints already asked is not
 * asked again.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { studioTargets, type TargetSources } from "../src/projects/studio-targets";
import type { EndpointStats } from "../src/studio/studio-types";

const root = mkdtempSync(join(tmpdir(), "courier-targets-"));
const projectAt = (name: string, url?: string) => {
  const dir = join(root, name);
  mkdirSync(join(dir, ".courier"), { recursive: true });
  if (url) writeFileSync(join(dir, ".courier/studio.json"), JSON.stringify({ url }));
  return { root: dir, name, workspace: root };
};
const shop = projectAt("shop", "http://localhost:6280");
const admin = projectAt("admin");
const stale = projectAt("stale", "http://localhost:6299");

afterAll(() => rmSync(root, { recursive: true, force: true }));

function sources(overrides: Partial<TargetSources> = {}) {
  const asked: string[] = [];
  const known = new Map<string, EndpointStats[]>();
  const all: TargetSources = {
    projects: async () => [shop, admin, stale],
    configured: () => undefined,
    statsFor: (studio) => known.get(studio),
    answers: async (studio) => {
      asked.push(studio);
      return studio === "http://localhost:6280";
    },
    ...overrides,
  };
  return { all, asked, known };
}

describe("the Studios the Courier view shows", () => {
  it("keeps each project's own Studio while it answers, and none for the rest", async () => {
    const { all } = sources();

    expect(await studioTargets(all)).toEqual([
      { project: shop, studio: "http://localhost:6280" },
      { project: admin, studio: undefined },
      { project: stale, studio: undefined },
    ]);
  });

  it("does not ask again a Studio the hints already asked", async () => {
    const { all, asked, known } = sources();
    known.set("http://localhost:6280", []);

    await studioTargets(all);

    expect(asked).toEqual(["http://localhost:6299"]);
  });

  it("shows the settings' Studio alone, answering or not", async () => {
    const { all } = sources({ configured: () => "http://localhost:6280" });
    const { all: silent } = sources({ configured: () => "http://localhost:7000" });

    expect(await studioTargets(all)).toEqual([{ studio: "http://localhost:6280" }]);
    expect(await studioTargets(silent)).toEqual([{ studio: undefined }]);
  });
});
