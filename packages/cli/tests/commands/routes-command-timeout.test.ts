/**
 * `courier-cli routes` on a config that never finishes loading: it says so,
 * and ends the process, whose event loop the config's code would otherwise
 * keep alive for good.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@noverax/courier-build/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noverax/courier-build/config")>();
  return {
    ...actual,
    loadCourierConfig: vi.fn((options: { cwd: string; timeoutMs?: number }) =>
      Promise.reject(
        actual.loadTimedOut(
          { entry: join(options.cwd, "courier.config.ts") },
          options.timeoutMs ?? 0,
        ),
      ),
    ),
  };
});

const { routesCommand } = await import("../../src/commands/routes-command");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-routes-timeout-"));
  writeFileSync(join(dir, "courier.config.ts"), "await new Promise(() => {});\n");
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("courier-cli routes, given a config that never finishes loading", () => {
  it("gives it up after 60 s, says so, and ends with status 1", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await runCommand(routesCommand, { rawArgs: ["--cwd", dir, "--check"] });

    expect(error.mock.calls.flat().map(String).join("\n")).toContain(
      "courier.config.ts was still loading after 60 s and was given up.",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
