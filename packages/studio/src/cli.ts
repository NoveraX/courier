#!/usr/bin/env node
import { createLogger } from "@noverax/courier";
import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT } from "@noverax/courier/config";
import { defineCommand, runMain } from "citty";
import { setProjectRoot } from "./context";
import { checkNodeVersion } from "./node-version";
import { createStudioServer } from "./server";
import { printBanner } from "./server/banner";
import { initProject } from "./server/init";
import { readStudioAddress } from "./server/studio-address";

checkNodeVersion();

const log = createLogger("CLI");

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize project: ignore the Courier Studio cache directory",
  },
  run() {
    setProjectRoot(process.cwd());
    const { gitignoreUpdated } = initProject();
    log.info(gitignoreUpdated ? ".gitignore now ignores .courier/" : "project already initialized");
  },
});

const main = defineCommand({
  meta: {
    name: "courier-studio",
    description: "Courier Studio — standalone inspection & debugging server",
  },
  subCommands: { init },
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
    const projectRoot = args.cwd || process.cwd();

    /* `studio.port` and `studio.host` are documented, typed, and read by every
       client that dials Studio. The server used to ignore them, so configuring
       them moved the clients and left the server where it was. */
    const configured = await readStudioAddress(projectRoot);

    const port = args.port
      ? Number.parseInt(args.port, 10)
      : (configured.port ?? STUDIO_DEFAULT_PORT);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      log.error(`Invalid port: "${args.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }
    const host = args.host || configured.host || STUDIO_DEFAULT_HOST;

    createStudioServer({
      port,
      host,
      ...(configured.mockBasePort === undefined ? {} : { mockBasePort: configured.mockBasePort }),
      projectRoot,
      onReady: async (url) => {
        printBanner(host, port);

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
