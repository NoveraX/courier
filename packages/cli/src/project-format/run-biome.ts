import { spawn } from "node:child_process";
import { createLogger } from "@noverax/courier";
import type { ToolCommand } from "./biome-binary";

const log = createLogger("Project");

/* Long enough for a file of several megabytes; a formatter that takes longer is stuck. */
const TIMEOUT_MS = 30_000;

/**
 * Format one file's text with the project's Biome, as the project formats
 * the file at that path: Biome reads the text on its standard input and
 * finds the project's configuration and ignore files from the path, which
 * need not exist yet. It sorts the imports and formats; its lint rules do
 * not run, so nothing but layout and import order changes.
 *
 * @param command - How the project's Biome is started
 * @param path - The file's absolute path, which picks the configuration
 * @param text - The text to format
 * @param cwd - The project root, where Biome looks for its configuration first
 * @returns The formatted text
 * @throws {Error} When Biome fails, writes nothing, or takes too long
 * @example
 * ```ts
 * const formatted = await runBiome(command, "/app/src/api/pets/index.ts", text, "/app");
 * ```
 */
export function runBiome(
  command: ToolCommand,
  path: string,
  text: string,
  cwd: string,
): Promise<string> {
  const args = [
    "check",
    "--write",
    "--linter-enabled=false",
    "--no-errors-on-unmatched",
    "--colors=off",
    `--stdin-file-path=${path}`,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(command.program, [...command.prefix, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`it took longer than ${TIMEOUT_MS / 1000} s`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const formatted = Buffer.concat(out).toString("utf8");
      if (code === 0 && (formatted !== "" || text === "")) return resolve(formatted);
      const reason = Buffer.concat(err).toString("utf8").trim().split("\n")[0] ?? "";
      reject(new Error(`it exited with ${code}${reason ? `: ${reason}` : ""}`));
    });
    /* A tool that closes its input early says why in its exit status. */
    child.stdin.on("error", (error) => log.debug(`Biome closed its input early`, error));
    child.stdin.end(text);
  });
}
