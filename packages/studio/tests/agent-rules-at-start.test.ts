/**
 * Courier's block in AGENTS.md as Studio starts for a project in a folder
 * of its own: an outdated block brought up to date, markers that repeat
 * left as they are with one line of the log, and a project without the
 * file given none — each once Studio is up.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_RULES, AGENT_RULES_BEGIN, AGENT_RULES_END } from "@noverax/courier-cli/devkit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

const OLD = `${AGENT_RULES_BEGIN}\nRead the docs of an older release.\n${AGENT_RULES_END}\n`;

let root: string | undefined;
let studio: StudioServer | undefined;

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

/* Studio started for a project whose AGENTS.md holds `agents`, or that has none: once it is up and
   what it put off past its start has run, the file and the lines of the log that name it. */
async function startedWith(agents?: string): Promise<{ file?: string; lines: string[] }> {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "courier-studio-start-")));
  root = project;
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop" }));
  const path = join(project, "AGENTS.md");
  if (agents !== undefined) writeFileSync(path, agents);
  const lines: string[] = [];
  for (const level of ["info", "warn"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("AGENTS.md")) lines.push(line);
    });
  }
  await new Promise<string>((done, fail) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: project,
      onReady: done,
      onError: fail,
    });
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { ...(existsSync(path) && { file: readFileSync(path, "utf8") }), lines };
}

describe("Courier's block in AGENTS.md as Studio starts", () => {
  it("is brought up to date where it is out of date", async () => {
    const { file, lines } = await startedWith(OLD);

    expect(file).toBe(`${AGENT_RULES}\n`);
    expect(lines).toEqual([expect.stringContaining("Brought Courier's block in")]);
  });

  it("is left as it is where its markers repeat, one line of the log saying why", async () => {
    const repeated = `${OLD}\n${OLD}`;
    const { file, lines } = await startedWith(repeated);

    expect(file).toBe(repeated);
    expect(lines).toEqual([expect.stringContaining("AGENTS.md was left as it is: ")]);
  });

  it("is written nowhere for a project without AGENTS.md, and the log says nothing of it", async () => {
    const { file, lines } = await startedWith();

    expect(file).toBeUndefined();
    expect(lines).toEqual([]);
  });
});
