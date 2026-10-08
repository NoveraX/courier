#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { type ArgsDef, defineCommand, runMain } from "citty";
import { closeOnFatal } from "./close-on-fatal";
import { OPENAPI_ARGS, openapiCommand } from "./commands/openapi-command";
import { checkNodeVersion } from "./node-version";
import { createStudioServer } from "./server";
import { printBanner } from "./server/banner";
import { parsePort } from "./server/parse-port";
import { quietSqliteWarning } from "./server/storage/quiet-sqlite-warning";
import { studioUrls, tokenLink, withToken } from "./server/studio-urls";
import { studioVersion } from "./server/studio-version";

checkNodeVersion();
quietSqliteWarning();

const log = createLogger("CLI");

/** Stop with one line naming the problem, not a stack. */
function fail(message: string): never {
  log.error(message);
  process.exit(1);
}

const SUMMARY = "Visual debugging studio for Courier projects";

const ARGS = {
  port: {
    type: "string",
    valueHint: "port",
    description: `Server port (falls back to studio.port, then ${STUDIO_DEFAULT_PORT})`,
  },
  host: {
    type: "string",
    valueHint: "host",
    description: `Server host (falls back to studio.host, then ${STUDIO_DEFAULT_HOST})`,
  },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  open: {
    type: "boolean",
    description: "Open a browser on start (falls back to studio.open); --no-open to keep it closed",
  },
} as const satisfies ArgsDef;

/* citty's own help colours a pipe and a log file; this one follows the
   terminal, as every line Studio prints does. */
async function printHelp(): Promise<void> {
  const help = {
    product: "Courier Studio",
    version: studioVersion(),
    summary: SUMMARY,
    command: "courier-studio",
    options: helpOptions(ARGS),
    commands: [
      { name: "openapi", description: "Write the project's sources as OpenAPI documents" },
    ],
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

async function printOpenAPIHelp(): Promise<void> {
  const help = {
    product: "Courier Studio",
    version: studioVersion(),
    summary:
      "Write the project's sources, as courier.config.ts declares them, as OpenAPI documents",
    command: "courier-studio openapi",
    options: helpOptions(OPENAPI_ARGS),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const main = defineCommand({
  meta: { name: "courier-studio", version: studioVersion(), description: SUMMARY },
  args: ARGS,
  run({ args }) {
    /* Its one command is dispatched before this runs: any other word is
       refused rather than ignored, so `courier-studio init` does not start the server. */
    if (args._.length > 0) fail(`Unknown command "${args._[0]}". Run courier-studio --help.`);

    const projectRoot = resolve(args.cwd ?? process.cwd());
    if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
      fail(`Project root ${projectRoot} is not a directory. Check --cwd.`);
    }

    /* A flag pins the address; what it leaves out comes from `studio.port`
       and `studio.host` in the config, which every client that dials Studio
       reads too, so the server moves with its clients. */
    const port = args.port === undefined ? undefined : parsePort(args.port, "--port");
    if (port instanceof Error) fail(port.message);

    const server = createStudioServer({
      ...(port === undefined ? {} : { port }),
      ...(args.host === undefined ? {} : { host: args.host }),
      projectRoot,
      /* Without this a second `courier studio` printed one line and then sat
         in the foreground looking frozen, having started nothing. */
      onError: async (err) => {
        log.error(err.message);
        await server.close();
        process.exitCode = 1;
      },
      onStarted: async ({ url, host, port: listening, studio }) => {
        printBanner(studioVersion(), withToken(studioUrls(host, listening), server.token));

        if (args.open ?? studio.open) {
          try {
            const { default: openBrowser } = await import("open");
            await openBrowser(tokenLink(url, server.token));
          } catch (err) {
            /* Every launch attempt failed; the server is up either way. */
            log.warn("Could not open a browser", err);
          }
        }
      },
    });
    closeOnSignals(server);
    closeOnFatal(() => server.close());
  },
});

/** Exit statuses a shell reports for a process a signal ended: 128 + the signal's number. */
const SIGNAL_EXIT = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;

/* Studio closes its mock servers and sockets before it goes, and says so if
   that fails — also when its terminal closes (SIGHUP) — and exits with the
   status a shell reports for the signal. */
function closeOnSignals(server: { close: () => Promise<void> }): void {
  for (const [signal, status] of Object.entries(SIGNAL_EXIT)) {
    process.once(signal, () => {
      server
        .close()
        .catch((err: unknown) => log.error("Studio did not close cleanly", err))
        .finally(() => process.exit(status));
    });
  }
}

/* A command is its own program: `courier-studio openapi` writes documents and starts no server. */
if (process.argv[2] === "openapi") {
  void runMain(openapiCommand, { rawArgs: process.argv.slice(3), showUsage: printOpenAPIHelp });
} else {
  void runMain(main, { showUsage: printHelp });
}
