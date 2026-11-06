/**
 * Studio brings Courier's block in a project's AGENTS.md up to date as it
 * starts, with the devkit's module of the block — create-courier's own,
 * so that the commands that write the block and Studio never write two.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as rules from "@noverax/create-courier/agent-rules";
import { afterAll, describe, expect, it } from "vitest";

import { AGENT_RULES, AGENT_RULES_BEGIN, AGENT_RULES_END, updateAgentRules } from "../src/devkit";
import { projectWith, removeProjects } from "./helpers/temp-project";

afterAll(removeProjects);

describe("the devkit's block in AGENTS.md", () => {
  it("is create-courier's, and brings a project's block up to date", () => {
    const stale = `# Rules\n\n${AGENT_RULES_BEGIN}\nRead the docs.\n${AGENT_RULES_END}\n`;
    const root = projectWith({ "AGENTS.md": stale });

    expect(updateAgentRules).toBe(rules.updateAgentRules);
    expect(updateAgentRules(root)).toEqual({ kind: "updated", path: join(root, "AGENTS.md") });
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(`# Rules\n\n${AGENT_RULES}\n`);
  });
});
