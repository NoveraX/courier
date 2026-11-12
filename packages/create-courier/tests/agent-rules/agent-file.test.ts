import { chmodSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  AGENT_FILE_MAX_BYTES,
  AGENT_RULES,
  AGENT_RULES_BEGIN,
  AGENT_RULES_END,
  readAgentFile,
  updateAgentRules,
} from "../../src/agent-rules";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const STALE = `${AGENT_RULES_BEGIN}\nRead the docs.\n${AGENT_RULES_END}`;
const agentsOf = (root: string) => readFileSync(join(root, "AGENTS.md"), "utf8");

describe("a file of the agents' rules, as Courier reads it", () => {
  it("is its text, its BOM kept, or nothing where there is none", () => {
    const root = projectWith({ "AGENTS.md": "\uFEFF# Rules\n" });

    expect(readAgentFile(join(root, "AGENTS.md"))).toEqual({
      kind: "text",
      text: "\uFEFF# Rules\n",
    });
    expect(readAgentFile(join(root, "RULES.md"))).toEqual({ kind: "none" });
  });

  it("is left as it is where it is a link, not a file, over 1 MiB or not UTF-8", () => {
    const root = projectWith({ "docs/rules.md": "# Rules\n" });
    symlinkSync(join(root, "docs/rules.md"), join(root, "AGENTS.md"));
    mkdirSync(join(root, "folder.md"));
    writeFileSync(join(root, "large.md"), "a".repeat(AGENT_FILE_MAX_BYTES + 1));
    writeFileSync(join(root, "latin1.md"), Buffer.from([0x23, 0x20, 0xe9, 0x0a]));
    writeFileSync(join(root, "limit.md"), "a".repeat(AGENT_FILE_MAX_BYTES));

    expect(readAgentFile(join(root, "AGENTS.md"))).toEqual({ kind: "left", why: "it is a link" });
    expect(readAgentFile(join(root, "folder.md"))).toEqual({
      kind: "left",
      why: "it is not a file",
    });
    expect(readAgentFile(join(root, "large.md"))).toEqual({
      kind: "left",
      why: "it is larger than 1 MiB",
    });
    expect(readAgentFile(join(root, "latin1.md"))).toEqual({
      kind: "left",
      why: "it is not UTF-8 text",
    });
    expect(readAgentFile(join(root, "limit.md")).kind).toBe("text");
  });
});

describe("bringing Courier's block in AGENTS.md up to date, as Studio does as it starts", () => {
  it("writes the block between its markers, the rest of the file and its mode kept", () => {
    const root = projectWith({
      "AGENTS.md": `# Rules\r\n\r\n${STALE.replace(/\n/g, "\r\n")}\r\nUse pnpm.\r\n`,
    });
    chmodSync(join(root, "AGENTS.md"), 0o640);
    /* The mode as the system keeps it: whole on macOS and Linux; on Windows only whether the file
       is read-only, so one its owner may write reads as anyone's to read and write. */
    const mode = statSync(join(root, "AGENTS.md")).mode & 0o777;
    expect(mode).toBe(process.platform === "win32" ? 0o666 : 0o640);

    const update = updateAgentRules(root);

    expect(update).toEqual({ kind: "updated", path: join(root, "AGENTS.md") });
    expect(agentsOf(root)).toBe(
      `# Rules\r\n\r\n${AGENT_RULES.replace(/\n/g, "\r\n")}\r\nUse pnpm.\r\n`,
    );
    expect(statSync(join(root, "AGENTS.md")).mode & 0o777).toBe(mode);
    expect(updateAgentRules(root)).toBeNull();
  });

  it("writes nothing where there is no file, no block in it, or the block up to date", () => {
    const none = projectWith({});
    const without = projectWith({ "AGENTS.md": "# Rules\n" });
    const current = projectWith({ "AGENTS.md": `# Rules\n\n${AGENT_RULES}\n` });

    expect(updateAgentRules(none)).toBeNull();
    expect(updateAgentRules(without)).toBeNull();
    expect(updateAgentRules(current)).toBeNull();
    expect(readAgentFile(join(none, "AGENTS.md"))).toEqual({ kind: "none" });
    expect(agentsOf(without)).toBe("# Rules\n");
  });

  it("follows no link at AGENTS.md, and leaves the file it leads to as it is", () => {
    const root = projectWith({ "docs/rules.md": `${STALE}\n` });
    symlinkSync(join(root, "docs/rules.md"), join(root, "AGENTS.md"));

    expect(updateAgentRules(root)).toBeNull();
    expect(readFileSync(join(root, "docs/rules.md"), "utf8")).toBe(`${STALE}\n`);
  });

  it("leaves a file whose markers it cannot tell apart as it is, and says why", () => {
    const root = projectWith({ "AGENTS.md": `${STALE}\n${STALE}\n` });

    expect(updateAgentRules(root)).toEqual({
      kind: "left",
      path: join(root, "AGENTS.md"),
      why: "it holds Courier's BEGIN marker more than once",
    });
    expect(agentsOf(root)).toBe(`${STALE}\n${STALE}\n`);
  });

  /* Not on Windows, whose folders take new files whatever their mode, nor as root, whom no mode stops. */
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "says why where the folder takes no file, and leaves AGENTS.md as it was",
    () => {
      const root = projectWith({ "AGENTS.md": `${STALE}\n` });
      chmodSync(root, 0o500);
      try {
        expect(updateAgentRules(root)).toEqual({
          kind: "left",
          path: join(root, "AGENTS.md"),
          why: "it could not be written (EACCES)",
        });
      } finally {
        chmodSync(root, 0o700);
      }
      expect(agentsOf(root)).toBe(`${STALE}\n`);
    },
  );
});
