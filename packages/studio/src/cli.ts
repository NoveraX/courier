#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { setProjectRoot } from "./context";
import { createStudioServer } from "./server";
import { initProject } from "./server/init";

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize project: create registry.nexus.json, update .gitignore",
  },
  run() {
    setProjectRoot(process.cwd());
    const { registryCreated, gitignoreUpdated } = initProject();
    if (registryCreated) console.log("  ✓ registry.nexus.json created");
    if (gitignoreUpdated) console.log("  ✓ .gitignore updated with cache files");
    if (!registryCreated && !gitignoreUpdated) console.log("  ✓ project already initialized");
  },
});

const main = defineCommand({
  meta: {
    name: "nexus-studio",
    description: "Nexus Studio — standalone inspection & debugging server",
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
      console.error(`Invalid port: "${args.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }
    const host = args.host;
    const projectRoot = args.cwd || process.cwd();

    createStudioServer({
      port,
      host,
      projectRoot,
      onReady: async (url) => {
        console.log(`\n  Nexus Studio running at ${url}\n`);
        console.log("  Waiting for app connections on /app namespace...\n");

        if (args.open) {
          const { default: openBrowser } = await import("open");
          await openBrowser(url);
        }
      },
    });
  },
});

runMain(main);
