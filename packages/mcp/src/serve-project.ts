import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, getSources } from "@noverax/courier";

import { createMcpServer } from "./protocol/mcp-server";
import { requestStates } from "./protocol/request-state";
import { courierTools } from "./tools/courier-tools";
import { toolSource } from "./tools/tool-source";
import { serveStdio } from "./transport/serve-stdio";

const log = createLogger("MCP");

/** How the stdio server is started for a project. */
export interface ProjectServer {
  /** The project's root, where `courier.config.*` is. */
  readonly root: string;
  /** The sources to offer, by name; every one when absent. */
  readonly only?: readonly string[] | undefined;
  /** Files of environment variables to load first, relative to the root. */
  readonly envFiles?: readonly string[] | undefined;
  readonly allowDestructive: boolean;
  /** How long a call may take when its endpoint names no timeout, in milliseconds. */
  readonly timeoutMs: number;
  readonly info: { readonly name: string; readonly version: string };
  /** The client's lines, and where the server's go. */
  readonly input: NodeJS.ReadableStream;
  readonly write: (line: string) => void;
}

/**
 * Serve a project's agent tools over stdio, the way an editor's agent starts
 * a local MCP server.
 *
 * The project's `courier.config.*` is loaded as the application's runtime
 * loads it, which registers its sources and — outside production, with
 * Studio running — shows every call an agent makes in Studio.
 *
 * @param options - The project, which sources, and the stdio streams
 * @returns Settles once the client closes the connection
 * @throws Error when the project has no config, no sources, or a source it was asked for
 * @example
 * ```ts
 * await serveProject({ root: process.cwd(), allowDestructive: false, timeoutMs: 60_000, info, input, write });
 * ```
 */
export async function serveProject(options: ProjectServer): Promise<void> {
  for (const file of options.envFiles ?? []) {
    const path = resolve(options.root, file);
    if (!existsSync(path)) throw new Error(`--dotenv ${file}: there is no file at ${path}`);
    process.loadEnvFile(path);
  }
  process.chdir(options.root);
  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
  await attachRuntime("mcp");
  const sources = getSources();
  if (sources === undefined || Object.keys(sources).length === 0) {
    throw new Error(
      `No sources to offer: ${options.root} has no courier.config.* that declares them (see above)`,
    );
  }
  const unknown = options.only?.find((name) => !Object.hasOwn(sources, name));
  if (unknown !== undefined) {
    throw new Error(
      `--source ${unknown}: courier.config has no such source — it has ${Object.keys(sources).join(", ")}`,
    );
  }
  const tools = toolSource(undefined, { only: options.only });
  const { tools: offered } = tools.catalog();
  log.info(
    offered.length === 0
      ? "No endpoint is marked .agent(), so there are no tools to offer"
      : `${offered.length} tool${offered.length === 1 ? "" : "s"}: ${offered.map((tool) => tool.name).join(", ")}`,
  );
  const server = createMcpServer({
    info: options.info,
    tools: courierTools(tools, options.timeoutMs),
    allowDestructive: options.allowDestructive,
    states: requestStates(crypto.getRandomValues(new Uint8Array(32))),
    maxResultChars: 100_000,
    transport: "stdio",
  });
  await serveStdio(server, { input: options.input, write: options.write });
}
