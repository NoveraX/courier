/**
 * Studio's start, which bringing Courier's block in AGENTS.md up to date
 * never holds up nor stops: the update runs once the start has returned,
 * and what it throws is one line of the log, with Studio up all the same.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@noverax/courier-cli/devkit", async (original) => ({
  ...(await original<typeof import("@noverax/courier-cli/devkit")>()),
  updateAgentRules: () => {
    calls.push("update");
    throw new Error("the disk went away");
  },
}));

const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-studio-start-order-")));
let studio: StudioServer | undefined;

afterAll(async () => {
  await studio?.close();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("Studio's start", () => {
  it("returns before the block is brought up to date, and stays up when that throws", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop" }));
    writeFileSync(join(root, "AGENTS.md"), "# The shop\n");
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(" ");
      if (line.includes("AGENTS.md")) lines.push(line);
    });

    const url = await new Promise<string>((done, fail) => {
      studio = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: root,
        onReady: done,
        onError: fail,
      });
      calls.push("returned");
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls).toEqual(["returned", "update"]);
    expect(lines).toEqual([
      expect.stringContaining(`${join(root, "AGENTS.md")} was left as it is: the disk went away`),
    ]);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# The shop\n");
    expect((await fetch(`${url}/api/health`)).ok).toBe(true);
  });
});
