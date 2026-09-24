#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { defineCommand, runMain } from "citty";
import { checkNodeVersion } from "./node-version";
import { createStudioServer } from "./server";
import { printBanner } from "./server/banner";
import { parsePort } from "./server/parse-port";
import { readStudioAddress } from "./server/studio-address";
import { studioUrls } from "./server/studio-urls";
import { studioVersion } from "./server/studio-version";

checkNodeVersion();

const log = createLogger("CLI");

/** Stop with one line naming the problem, not a stack. */
function fail(message: string): never {
  log.error(message);
  process.exit(1);
}

const main = defineCommand({
  meta: {
    name: "courier-studio",
    version: studioVersion(),
    description: "Courier Studio — standalone inspection & debugging server",
  },
  args: {
    port: {
      type: "string",
      description: `Server port (falls back to studio.port, then ${STUDIO_DEFAULT_PORT})`,
    },
    host: {
      type: "string",
      description: `Server host (falls back to studio.host, then ${STUDIO_DEFAULT_HOST})`,
    },
    cwd: {
      type: "string",
      description: "Project root directory (default: current working directory)",
    },
    open: {
      type: "boolean",
      description:
        "Open a browser on start (falls back to studio.open); --no-open to keep it closed",
    },
  },
  async run({ args }) {
    /* Studio takes no command. An unknown word used to be ignored and the
       server started anyway — `courier-studio init` did exactly that. */
    if (args._.length > 0) fail(`Unknown command "${args._[0]}". Run courier-studio --help.`);

    const projectRoot = resolve(args.cwd ?? process.cwd());
    if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
      fail(`Project root ${projectRoot} is not a directory. Check --cwd.`);
    }

    /* `studio.port` and `studio.host` are documented, typed, and read by every
       client that dials Studio. The server used to ignore them, so configuring
       them moved the clients and left the server where it was. */
    const configured = await readStudioAddress(projectRoot);

    const port =
      args.port !== undefined
        ? parsePort(args.port, "--port")
        : configured.port !== undefined
          ? parsePort(String(configured.port), "studio.port in courier.config")
          : STUDIO_DEFAULT_PORT;
    if (port instanceof Error) fail(port.message);
    const host = args.host ?? configured.host ?? STUDIO_DEFAULT_HOST;

    const server = createStudioServer({
      port,
      host,
      ...(configured.mockBasePort === undefined ? {} : { mockBasePort: configured.mockBasePort }),
      projectRoot,
      /* Without this a second `courier studio` printed one line and then sat
         in the foreground looking frozen, having started nothing. */
      onError: async (err) => {
        log.error(err.message);
        await server.close();
        process.exitCode = 1;
      },
      onReady: async (url) => {
        printBanner(studioVersion(), studioUrls(host, port));

        if (args.open ?? configured.open) {
          try {
            const { default: openBrowser } = await import("open");
            await openBrowser(url);
          } catch (err) {
            /* Every launch attempt failed; the server is up either way. */
            log.warn(`Could not open a browser: ${err instanceof Error ? err.message : err}`);
          }
        }
      },
    });
    closeOnSignals(server);
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

runMain(main);
