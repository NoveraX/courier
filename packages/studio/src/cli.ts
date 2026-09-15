#!/usr/bin/env node
import { createLogger } from "@noverax/courier";
import { defineCommand, runMain } from "citty";
import { setProjectRoot } from "./context";
import { checkNodeVersion } from "./node-version";
import { createStudioServer } from "./server";
import { printBanner } from "./server/banner";
import { initProject } from "./server/init";

checkNodeVersion();

const log = createLogger("CLI");

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize project: create registry.courier.json, update .gitignore",
  },
  run() {
    setProjectRoot(process.cwd());
    const { registryCreated, gitignoreUpdated } = initProject();
    if (registryCreated) log.info("registry.courier.json created");
    if (gitignoreUpdated) log.info(".gitignore updated with cache files");
    if (!registryCreated && !gitignoreUpdated) log.info("project already initialized");
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
      description: "Server port",
      default: "4380",
    },
    host: {
      type: "string",
      description: "Server host",
      default: "localhost",
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
    const port = Number.parseInt(args.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      log.error(`Invalid port: "${args.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }
    const host = args.host;
    const projectRoot = args.cwd || process.cwd();

    createStudioServer({
      port,
      host,
      projectRoot,
      onReady: async (url) => {
        printBanner(host, port);

        if (args.open) {
          const { default: openBrowser } = await import("open");
          await openBrowser(url);
        }
      },
    });
  },
});

runMain(main);
