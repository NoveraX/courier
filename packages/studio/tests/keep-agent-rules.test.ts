/**
 * Courier's block in a project's AGENTS.md, as Studio starts: brought up
 * to date where it is there, the rest of the file as it was; a file without
 * it, which is the person's, and a read-only one, left alone; and one whose
 * markers repeat, or that cannot be written, left as it is, one line of the
 * log saying why.
 */
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(`${AGENTS()} was left as it is: `);
  });

  /* Its owner's choice, kept as a link is: on Windows, the read-only attribute. */
  it("leaves a read-only file alone, saying nothing", () => {
    writeFileSync(AGENTS(), `${OLD}\n`);
    chmodSync(AGENTS(), 0o444);
    try {
      keepAgentRules(root);
    } finally {
      chmodSync(AGENTS(), 0o644);
    }

    expect(readFileSync(AGENTS(), "utf8")).toBe(`${OLD}\n`);
    expect(logged).toEqual([]);
  });

  /* A file the system will not let Studio replace: the block is written beside it and renamed in,
     which a folder that takes no new file stops on macOS and Linux — by its owner's permissions,
     which root's would not. Windows' folders take new files whatever their mode. */
  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "leaves a file it cannot write as it is, and the log says why",
    () => {
      writeFileSync(AGENTS(), `${OLD}\n`);
      chmodSync(root, 0o555);
      try {
        keepAgentRules(root);
      } finally {
        chmodSync(root, 0o755);
      }

      expect(readFileSync(AGENTS(), "utf8")).toBe(`${OLD}\n`);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain(`${AGENTS()} was left as it is: it could not be written`);
    },
  );
});
