/**
 * Whatever a setup has written when it stops, undoing it leaves the
 * project as it was, byte for byte, its folders too: checked on plans
 * drawn at random — new files in new folders and in old ones, changes to
 * the project's files and to files the plan just added, the same file
 * changed twice — each stopped at a step drawn at random.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { FileJournal } from "../../src/apply/file-journal";
import { projectWith, removeProjects } from "../recipes/project-fixture";
import { seededRandom } from "./seeded-random";

afterAll(removeProjects);

const FOLDERS = ["", "src", "src/courier", "src/courier/deep", "app", "existing", "existing/old"];
const EXISTING = { "existing/old/config.ts": "old\n", "package.json": "{}\n", "app.ts": "app\n" };

type Step =
  | { readonly kind: "create"; readonly path: string; readonly content: string }
  | { readonly kind: "replace"; readonly path: string; readonly after: string };

function tree(root: string, dir = ""): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(found, { [`${path}/`]: "" }, tree(root, path));
    else found[path] = readFileSync(join(root, path), "base64");
  }
  return found;
}

/* A plan of creations and changes, each new path once, each change to a file there by then. */
function drawSteps(next: (below: number) => number): Step[] {
  const there = new Set(Object.keys(EXISTING));
  const steps: Step[] = [];
  for (let at = 0, count = 2 + next(7); at < count; at++) {
    const changed = [...there];
    if (next(3) === 0 && changed.length > 0) {
      const path = changed[next(changed.length)] ?? "";
      steps.push({ kind: "replace", path, after: `changed ${at} ${"x".repeat(next(200))}\n` });
      continue;
    }
    const folder = FOLDERS[next(FOLDERS.length)] ?? "";
    const path = `${folder === "" ? "" : `${folder}/`}file-${at}.ts`;
    there.add(path);
    steps.push({ kind: "create", path, content: `created ${at}\n` });
  }
  return steps;
}

describe("undoing a setup", () => {
  it("leaves the project as it was, whatever the plan and wherever it stops", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = seededRandom(seed);
      const steps = drawSteps(next);
      const stop = next(steps.length + 1);
      const root = projectWith(EXISTING);
      const before = tree(root);
      const journal = new FileJournal(root);
      for (const step of steps.slice(0, stop)) {
        if (step.kind === "create") journal.create(step.path, step.content);
        else journal.replace(step.path, readFileSync(join(root, step.path), "utf8"), step.after);
      }

      const undone = journal.undo();

      expect(undone.kept, `seed ${seed}, stopped after ${stop}`).toEqual([]);
      expect(tree(root), `seed ${seed}, stopped after ${stop}`).toEqual(before);
      expect(existsSync(join(root, "src"))).toBe(false);
    }
  });
});
