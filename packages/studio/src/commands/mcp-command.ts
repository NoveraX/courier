import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { formatStudioUrl, STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { type ArgsDef, defineCommand } from "citty";

import { loadCourierConfig } from "../server/config-loader";
import { bridgeToStudio } from "./mcp-bridge";

const log = createLogger("MCP");

/** The `mcp` command's options. */
export const MCP_ARGS = {
  cwd: {
    type: "string",
    valueHint: "dir",
    description:
      "Project root, where Studio keeps .courier/studio-token (default: the working directory)",
  },
  url: {
    type: "string",
    valueHint: "url",
    description: "Studio's address (default: the one courier.config.ts gives Studio)",
  },
} as const satisfies ArgsDef;

/**
 * `courier-studio mcp` — serve the running Studio to an editor's agent over
 * stdio: the requests it recorded, one in full, its mocks and their
 * scenarios. It reads the project's Studio token itself, so no token is
 * written into an editor's settings.
 *
 * @example
 * ```sh
 * claude mcp add courier-studio -- npx @noverax/courier-studio mcp
 * ```
 */
export const mcpCommand = defineCommand({
  meta: { name: "mcp", description: "Serve the running Studio to an editor's agent over stdio" },
  args: MCP_ARGS,
  async run({ args }) {
    const { stdout, stderr } = process;
    const original = stdout.write.bind(stdout);
    /* Over stdio, stdout is the protocol's: everything else goes to the log the editor shows. */
    stdout.write = stderr.write.bind(stderr) as typeof stdout.write;
    try {
      const root = resolve(args.cwd ?? process.cwd());
      const tokenFile = join(root, ".courier", "studio-token");
      if (!existsSync(tokenFile))
        throw new Error(
          `No Studio token in ${root}: start Studio there first, with npx @noverax/courier-studio`,
        );
      const token = readFileSync(tokenFile, "utf8").trim();
      const url = `${(args.url ?? (await configuredUrl(root))).replace(/\/$/, "")}/mcp`;
      await bridgeToStudio({
        input: process.stdin,
        write: (line) => original(`${line}\n`),
        url,
        token,
      });
      process.exit(0);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});

async function configuredUrl(root: string): Promise<string> {
  const { config } = await loadCourierConfig(root);
  return formatStudioUrl(
    config.studio?.host ?? STUDIO_DEFAULT_HOST,
    config.studio?.port ?? STUDIO_DEFAULT_PORT,
  );
}
