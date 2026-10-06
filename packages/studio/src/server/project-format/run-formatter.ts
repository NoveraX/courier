import { spawn } from "node:child_process";
import { createLogger } from "@noverax/courier";
import type { FormatterTool } from "./find-formatters";

const log = createLogger("Studio");

/* Long enough for a file of several megabytes; a formatter that takes longer is stuck. */
const TIMEOUT_MS = 30_000;

/**
 * Format one file's text with a tool the project installed, as the project
 * formats the file at that path: the tool reads the text on its standard
 * input and finds the project's configuration and ignore files from the
 * path, which need not exist yet. Biome also sorts the imports; its lint
 * rules do not run, so nothing but layout and import order changes.
 *
 * @param tool - The installed formatter
 * @param path - The file's absolute path, which picks the configuration
 * @param text - The text to format
 * @param cwd - The project root, where the tool looks for its configuration first
 * @returns The formatted text
 * @throws {Error} When the tool fails, writes nothing, or takes too long
 * @example
 * ```ts
 * const formatted = await runFormatter(biome, "/app/src/api/pets/index.ts", text, "/app");
 * ```
 */
export function runFormatter(
  tool: FormatterTool,
  path: string,
  text: string,
  cwd: string,
): Promise<string> {
  const args =
    tool.name === "Biome"
      ? [
          "check",
          "--write",
          "--linter-enabled=false",
          "--no-errors-on-unmatched",
          "--colors=off",
          `--stdin-file-path=${path}`,
        ]
      : ["--stdin-filepath", path];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool.bin, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${tool.name} took longer than ${TIMEOUT_MS / 1000} s`));
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
      reject(new Error(`${tool.name} exited with ${code}${reason ? `: ${reason}` : ""}`));
    });
    /* A tool that closes its input early says why in its exit status. */
    child.stdin.on("error", (error) => log.debug(`${tool.name} closed its input early`, error));
    child.stdin.end(text);
  });
}
