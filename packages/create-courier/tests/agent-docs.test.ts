import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createTerminalStyle } from "@noverax/courier/internal";
import { afterAll, describe, expect, it } from "vitest";

import { agentDocsWanted, withAgentDocs } from "../src/agent-docs";
import { AGENT_RULES, AGENT_RULES_BEGIN, AGENT_RULES_END } from "../src/agent-rules";
import { SetupFailure } from "../src/apply/setup-failure";
import { transact } from "../src/apply/transaction";
import { buildPlan } from "../src/plan/build-plan";
import { packageManager } from "../src/project/package-manager";
import { readProject } from "../src/project/read-project";
import type { Recipe } from "../src/recipes/recipe-types";
import type { SetupEnd } from "../src/report/setup-report";
import { textReport } from "../src/report/text-report";
import { contextOf, manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

const NOTHING: Recipe = {
  files: [],
  edits: [],
  dependencies: [],
  devDependencies: [],
  scripts: {},
  manual: [],
  next: [],
};
const OWN = "CLAUDE.md";
const STALE = `${AGENT_RULES_BEGIN}\nRead the docs.\n${AGENT_RULES_END}`;

function honoWith(files: Readonly<Record<string, string>>, listed = {}): string {
  return projectWith({ "package.json": manifest({ hono: "4.10.0", ...listed }), ...files });
}

function planIn(root: string, agentRules = true) {
  const ctx = contextOf(root, "hono", { agentRules });
  return buildPlan(ctx, withAgentDocs(ctx, NOTHING));
}

describe("pointing the editor's agent at the docs", () => {
  it("adds AGENTS.md with Courier's block, the file that reads it, and the docs, in a project with none", () => {
    const plan = planIn(honoWith({}));

    expect(plan.files.map(({ path, state, content }) => [path, state, content])).toEqual([
      ["AGENTS.md", "create", `${AGENT_RULES}\n`],
      [OWN, "create", "@AGENTS.md\n"],
    ]);
    expect(plan.devDependencies).toEqual([
      expect.stringMatching(/^@noverax\/courier-docs(@\^.+)?$/),
    ]);
    expect(plan.agentRules).toEqual([
      { path: "AGENTS.md", state: "create" },
      { path: OWN, state: "create" },
    ]);
    expect(plan.next.at(-1)?.what).toMatch(
      /node_modules\/@noverax\/courier-docs\/docs, as AGENTS.md tells it$/,
    );
  });

  it("adds the block to the end of an AGENTS.md, and the line to the other file, nothing else in them changed", () => {
    const root = honoWith({ "AGENTS.md": "# Rules\r\n\r\nUse pnpm.\n", [OWN]: "# Notes\n" });

    const plan = planIn(root);

    expect(plan.edits.map(({ path, state, after }) => [path, state, after])).toEqual([
      [
        "AGENTS.md",
        "edit",
        `# Rules\r\n\r\nUse pnpm.\n\r\n${AGENT_RULES.replace(/\n/g, "\r\n")}\r\n`,
      ],
      [OWN, "edit", "# Notes\n\n@AGENTS.md\n"],
    ]);
    expect(plan.agentRules?.map(({ state }) => state)).toEqual(["append", "append"]);
  });

  it("brings an older block up to date in place, and asks nothing where both files hold what it writes", () => {
    const stale = honoWith({
      "AGENTS.md": `# Rules\n\n${STALE}\n\nUse pnpm.\n`,
      [OWN]: "See @AGENTS.md for the rules.\n",
    });
    const current = honoWith(
      { "AGENTS.md": `${AGENT_RULES}\n`, [OWN]: "@./AGENTS.md\n" },
      { "@noverax/courier-docs": "^0.5.0" },
    );

    const plan = planIn(stale);

    expect(plan.edits.find(({ path }) => path === "AGENTS.md")?.after).toBe(
      `# Rules\n\n${AGENT_RULES}\n\nUse pnpm.\n`,
    );
    expect(plan.agentRules?.map(({ state }) => state)).toEqual(["update", "same"]);
    expect(agentDocsWanted(readProject(stale))).toBe(true);
    expect(agentDocsWanted(readProject(current))).toBe(false);
    expect(planIn(current).agentRules?.map(({ state }) => state)).toEqual(["same", "same"]);
  });

  it("leaves an AGENTS.md whose markers it cannot tell apart as it is, and says why and what to keep", () => {
    const plan = planIn(honoWith({ "AGENTS.md": `${STALE}\n${STALE}\n` }));

    expect(plan.edits.map(({ path }) => path)).toEqual([]);
    expect(plan.manual[0]).toEqual({
      file: "AGENTS.md",
      what: "It holds Courier's BEGIN marker more than once, so it was left as it is: keep one pair of its markers, BEGIN before END, with the block between them",
      lines: AGENT_RULES.split("\n"),
    });
    expect(plan.agentRules?.map(({ state }) => state)).toEqual(["kept", "create"]);
  });

  it("follows no link at AGENTS.md, and leaves the other file alone beside one", () => {
    const root = honoWith({ "docs/rules.md": "# Rules\n" });
    symlinkSync(join(root, "docs/rules.md"), join(root, "AGENTS.md"));

    const plan = planIn(root);

    expect(plan.files).toEqual([]);
    expect(plan.manual.map(({ file, what }) => [file, what])).toEqual([
      [
        "AGENTS.md",
        "It is a link, so it was left as it is: add Courier's block to the end of the file it leads to",
      ],
    ]);
    expect(plan.agentRules).toEqual([{ path: "AGENTS.md", state: "kept" }]);
  });

  it("takes a link of the other file to AGENTS.md as reading it, and names the line for a link elsewhere", () => {
    const toAgents = honoWith({});
    symlinkSync("AGENTS.md", join(toAgents, OWN));
    const elsewhere = honoWith({ "notes.md": "# Notes\n" });
    symlinkSync("notes.md", join(elsewhere, OWN));

    expect(planIn(toAgents).agentRules?.map(({ state }) => state)).toEqual(["create", "same"]);
    expect(planIn(elsewhere).manual).toEqual([
      {
        file: OWN,
        what: "It is a link, so it was left as it is: the file it leads to reads AGENTS.md with this line",
        lines: ["@AGENTS.md"],
      },
    ]);
  });

  it("adds nothing where the person did not ask for it", () => {
    const plan = planIn(honoWith({}), false);

    expect(plan.files).toEqual([]);
    expect(plan.devDependencies).toEqual([]);
    expect(plan.agentRules).toBeUndefined();
  });

  it("is written through the setup's journal, and undone with the rest when the setup fails", async () => {
    const root = honoWith({ "AGENTS.md": "# Rules\n" });
    const ends: SetupEnd[] = [];
    const text = textReport(createTerminalStyle(0, false), () => undefined);
    const report = { ...text, end: (end: SetupEnd) => void ends.push(end) };

    const result = await transact(
      {
        root,
        manager: packageManager("npm"),
        plan: planIn(root),
        afterWrites: async () => {
          expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(AGENT_RULES);
          throw new SetupFailure("IMPORT_FAILED", "Studio's import failed");
        },
      },
      { questions: undefined, report, toolOutput: "stdout" },
    );

    expect(result).toBe(1);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");
    expect(existsSync(join(root, OWN))).toBe(false);
    expect(ends.at(-1)).toMatchObject({
      kind: "failed",
      undone: { removed: [OWN], putBack: ["AGENTS.md"], kept: [] },
    });
  });
});
