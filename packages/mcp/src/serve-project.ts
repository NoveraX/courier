import { createLogger, getSources } from "@noverax/courier";

import type { Narrowing } from "./policy/checked-policy";
import { checkSourceNames } from "./project/check-source-names";
import { loadEnvFiles } from "./project/load-env-files";
import { projectPolicy } from "./project/project-policy";
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
  /** What the start narrows the project's `agents` policy by: never wider than the config. */
  readonly narrowing?: Narrowing | undefined;
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
 * Studio running — shows every call an agent makes in Studio. Its `agents`
 * policy decides what is offered, as it stands when the server starts,
 * narrowed by `--read-only` and `--deny`.
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
  loadEnvFiles(options.root, options.envFiles);
  process.chdir(options.root);
  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
  const runtime = await attachRuntime("mcp");
  checkSourceNames(getSources(), options.root, options.only);
  const tools = toolSource(undefined, {
    only: options.only,
    policy: projectPolicy(() => runtime.config(), options.narrowing ?? {}),
  });
  const catalog = tools.catalog();
  log.info(
    catalog.tools.length === 0
      ? "No endpoint is offered to agents: mark one .agent(), or offer some in courier.config's agents"
      : `${catalog.tools.length} tool${catalog.tools.length === 1 ? "" : "s"}: ${catalog.tools.map((tool) => tool.name).join(", ")}`,
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
