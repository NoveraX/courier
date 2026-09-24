#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { defineCommand, runMain } from "citty";
import { checkNodeVersion } from "./node-version";
import { createStudioServer } from "./server";
import { printBanner } from "./server/banner";
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
      default: "",
    },
    host: {
      type: "string",
      description: `Server host (falls back to studio.host, then ${STUDIO_DEFAULT_HOST})`,
      default: "",
    },
    cwd: {
      type: "string",
      description: "Project root directory (default: current working directory)",
      default: "",
    },
    open: {
      type: "boolean",
      description: "Open browser on start",
      default: false,
    },
  },
  async run({ args }) {
    /* Studio takes no command. An unknown word used to be ignored and the
       server started anyway — `courier-studio init` did exactly that. */
    if (args._.length > 0) fail(`Unknown command "${args._[0]}". Run courier-studio --help.`);

    const projectRoot = resolve(args.cwd || process.cwd());
    if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
      fail(`Project root ${projectRoot} is not a directory. Check --cwd.`);
    }

    /* `studio.port` and `studio.host` are documented, typed, and read by every
       client that dials Studio. The server used to ignore them, so configuring
       them moved the clients and left the server where it was. */
    const configured = await readStudioAddress(projectRoot);

    const port = args.port
      ? Number.parseInt(args.port, 10)
      : (configured.port ?? STUDIO_DEFAULT_PORT);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      fail(`Invalid port: "${args.port}". Must be a number between 1 and 65535.`);
    }
    const host = args.host || configured.host || STUDIO_DEFAULT_HOST;

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

        if (args.open) {
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
  },
});

runMain(main);
