/**
 * Courier's block in a project's AGENTS.md, as Studio starts: brought up
 * to date where it is there, the rest of the file as it was; a file without
 * it, which is the person's, left alone; and one whose markers repeat left
 * as it is, the log saying why.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_RULES, AGENT_RULES_BEGIN, AGENT_RULES_END } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keepAgentRules } from "../src/server/keep-agent-rules";

let root: string;
let logged: string[];

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-studio-agents-")));
  logged = [];
  for (const level of ["info", "warn"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const AGENTS = () => join(root, "AGENTS.md");
const OLD = `${AGENT_RULES_BEGIN}\nRead the docs of an older release.\n${AGENT_RULES_END}`;

describe("Courier's block in AGENTS.md as Studio starts", () => {
  it("is brought up to date where it is there, and nothing else in the file changes", () => {
    writeFileSync(
      AGENTS(),
      `# The shop\r\n\r\n${OLD.replaceAll("\n", "\r\n")}\r\n\r\nUse pnpm.\r\n`,
    );
    keepAgentRules(root);

    expect(readFileSync(AGENTS(), "utf8")).toBe(
      `# The shop\r\n\r\n${AGENT_RULES.replaceAll("\n", "\r\n")}\r\n\r\nUse pnpm.\r\n`,
    );
    expect(logged.join("")).toContain(`Brought Courier's block in ${AGENTS()} up to date`);
  });

  it("leaves a file without it alone, and one where it is up to date, saying nothing", () => {
    writeFileSync(AGENTS(), "# The shop\n");
    keepAgentRules(root);
    expect(readFileSync(AGENTS(), "utf8")).toBe("# The shop\n");

    writeFileSync(AGENTS(), `${AGENT_RULES}\n`);
    keepAgentRules(root);
    expect(readFileSync(AGENTS(), "utf8")).toBe(`${AGENT_RULES}\n`);
    expect(logged).toEqual([]);
  });

  it("leaves a file whose markers repeat as it is, and the log says why", () => {
    const repeated = `${OLD}\n\n${OLD}\n`;
    writeFileSync(AGENTS(), repeated);
    keepAgentRules(root);

    expect(readFileSync(AGENTS(), "utf8")).toBe(repeated);
    expect(logged.join("")).toContain(`${AGENTS()} was left as it is: `);
  });
});
