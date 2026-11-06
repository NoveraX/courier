import { describe, expect, it } from "vitest";

import {
  AGENT_RULES,
  AGENT_RULES_BEGIN,
  AGENT_RULES_END,
  agentRulesProblem,
  updatedAgentRules,
  withAgentRules,
} from "../../src/agent-rules";
import { seededRandom } from "../apply/seeded-random";

/* The block as an older release wrote it: its markers, and other words between them. */
const STALE = `${AGENT_RULES_BEGIN}\n## Courier in this project\n\nRead the docs.\n${AGENT_RULES_END}`;
const crlf = (text: string) => text.replace(/\n/g, "\r\n");

describe("Courier's block in AGENTS.md", () => {
  it("is its markers, each on a line of its own, around what it tells the agent", () => {
    const lines = AGENT_RULES.split("\n");

    expect(lines[0]).toBe("<!-- BEGIN:courier-agent-rules -->");
    expect(lines.at(-1)).toBe("<!-- END:courier-agent-rules -->");
    expect(AGENT_RULES).toContain("node_modules/@noverax/courier-docs/docs/");
    expect(AGENT_RULES).toContain(
      "Delete the block, markers included, and nothing writes it again.",
    );
  });

  it("makes a new file the block alone, and goes after a file's text, an empty line between", () => {
    expect(withAgentRules("")).toBe(`${AGENT_RULES}\n`);
    expect(withAgentRules("# Rules\n")).toBe(`# Rules\n\n${AGENT_RULES}\n`);
    expect(withAgentRules("# Rules")).toBe(`# Rules\n\n${AGENT_RULES}\n`);
    expect(withAgentRules("# Rules\n\n")).toBe(`# Rules\n\n${AGENT_RULES}\n`);
  });

  it("is brought up to date between its markers, and nothing else in the file changes", () => {
    const text = `# Rules\n\nUse pnpm.\n\n  ${STALE}\n\n## Tests\n\nRun them.\n`;
    const want = `# Rules\n\nUse pnpm.\n\n${AGENT_RULES}\n\n## Tests\n\nRun them.\n`;

    expect(withAgentRules(text)).toBe(want);
    expect(updatedAgentRules(text)).toBe(want);
  });

  it("is left alone where it is up to date, its lines wrapped by a formatter or not", () => {
    const wrapped = AGENT_RULES.replace(/(.{60,79}) /g, "$1\n");
    const text = `# Rules\n\n${AGENT_RULES}\n`;

    expect(wrapped).not.toBe(AGENT_RULES);
    expect(updatedAgentRules(text)).toBeNull();
    expect(withAgentRules(text)).toBe(text);
    expect(updatedAgentRules(`# Rules\n\n${wrapped}\n`)).toBeNull();
    expect(updatedAgentRules(crlf(text))).toBeNull();
  });

  it("is never added by the update alone, to a file without it", () => {
    expect(updatedAgentRules("")).toBeNull();
    expect(updatedAgentRules("# Rules\n\nUse pnpm.\n")).toBeNull();
  });

  it.each([
    [`${STALE}\n${STALE}\n`, "it holds Courier's BEGIN marker more than once"],
    [`${STALE}\n${AGENT_RULES_END}\n`, "it holds Courier's END marker more than once"],
    [
      `# Rules\n${AGENT_RULES_BEGIN}\nRead the docs.\n`,
      "it holds Courier's BEGIN marker without its END",
    ],
    [`Read the docs.\n${AGENT_RULES_END}\n`, "it holds Courier's END marker without its BEGIN"],
    [
      `${AGENT_RULES_END}\nRead the docs.\n${AGENT_RULES_BEGIN}\n`,
      "Courier's END marker comes before its BEGIN",
    ],
    [
      `See ${AGENT_RULES_BEGIN} here.\nRead.\n${AGENT_RULES_END}\n`,
      "a marker of Courier's shares its line with other text",
    ],
    [
      `${AGENT_RULES_BEGIN} ${AGENT_RULES_END}\n`,
      "a marker of Courier's shares its line with other text",
    ],
  ])("leaves a file whose markers it cannot tell apart as it is: %#", (text, why) => {
    expect(agentRulesProblem(text)).toBe(why);
    expect(withAgentRules(text)).toBeUndefined();
    expect(updatedAgentRules(text)).toBeNull();
  });

  it("keeps the file's line ends, CRLF where it has them", () => {
    expect(withAgentRules(crlf("# Rules\n"))).toBe(crlf(`# Rules\n\n${AGENT_RULES}\n`));
    expect(updatedAgentRules(crlf(`# Rules\n\n${STALE}\n`))).toBe(
      crlf(`# Rules\n\n${AGENT_RULES}\n`),
    );
    /* A block whose own lines end in LF, in a file of CRLF, is written as it was. */
    expect(updatedAgentRules(`# Rules\r\n\r\n${STALE}\r\n`)).toBe(
      `# Rules\r\n\r\n${AGENT_RULES}\r\n`,
    );
  });

  it("keeps a BOM where the file starts with one, a marker on its first line too", () => {
    expect(withAgentRules("\uFEFF# Rules\n")).toBe(`\uFEFF# Rules\n\n${AGENT_RULES}\n`);
    expect(updatedAgentRules(`\uFEFF${STALE}\n`)).toBe(`\uFEFF${AGENT_RULES}\n`);
    expect(agentRulesProblem(`\uFEFF${STALE}\n`)).toBeUndefined();
  });
});

const PIECES = [
  "# Rules",
  "",
  "Use pnpm.",
  "  indented",
  "\t",
  "<!-- a comment -->",
  "`code`",
  "ü ✓",
];

/* A text of lines drawn from PIECES, each ended by LF or CRLF, the last maybe not ended at all. */
function textOf(next: (below: number) => number): string {
  const lines = Array.from({ length: next(6) }, () => PIECES[next(PIECES.length)] ?? "");
  return lines
    .map(
      (line, at) =>
        `${line}${at === lines.length - 1 && next(2) === 0 ? "" : next(2) === 0 ? "\n" : "\r\n"}`,
    )
    .join("");
}

describe("Courier's block, on texts drawn at random", () => {
  it("changes nothing outside its markers, and reads as written once it is", () => {
    const next = seededRandom(30);
    for (let run = 0; run < 500; run++) {
      const before = textOf(next);
      const after = textOf(next);
      const end = next(2) === 0 ? "\n" : "\r\n";
      const text = `${before}${before === "" || /\n$/.test(before) ? "" : "\n"}${STALE}${end}${after}`;
      const start = text.indexOf(AGENT_RULES_BEGIN);
      const stop = text.indexOf(AGENT_RULES_END) + AGENT_RULES_END.length;

      const updated = updatedAgentRules(text) ?? "";
      const added = withAgentRules(before) ?? "";

      expect(updated.slice(0, start)).toBe(text.slice(0, start));
      expect(updated.slice(updated.length - (text.length - stop))).toBe(text.slice(stop));
      expect(updatedAgentRules(updated)).toBeNull();
      expect(added.startsWith(before)).toBe(true);
      expect(updatedAgentRules(added)).toBeNull();
      expect(agentRulesProblem(added)).toBeUndefined();
    }
  });
});
