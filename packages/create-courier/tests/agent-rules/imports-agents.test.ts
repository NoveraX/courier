import { describe, expect, it } from "vitest";

import { importsAgents, withAgentsImport } from "../../src/agent-rules/imports-agents";

describe("the line that reads AGENTS.md", () => {
  it.each([
    ["@AGENTS.md\n", true],
    ["@./AGENTS.md", true],
    ["# Rules\n\nSee @AGENTS.md first.\n", true],
    ["See @AGENTS.md.\n", false],
    ["@AGENTS.md.bak\n", false],
    ["@AGENTS.mdx\n", false],
    ["mail@AGENTS.md\n", false],
    ["AGENTS.md\n", false],
  ])("is found in %j: %s", (text, found) => {
    expect(importsAgents(text)).toBe(found);
  });

  it("is added at the end, after an empty line, its BOM and line ends kept, and only once", () => {
    const bom = String.fromCharCode(0xfeff);

    expect(withAgentsImport("")).toBe("@AGENTS.md\n");
    expect(withAgentsImport("# Notes")).toBe("# Notes\n\n@AGENTS.md\n");
    expect(withAgentsImport(`${bom}# Notes\r\n`)).toBe(`${bom}# Notes\r\n\r\n@AGENTS.md\r\n`);
    expect(withAgentsImport("# Notes\n\n@AGENTS.md\n")).toBe("# Notes\n\n@AGENTS.md\n");
  });
});
