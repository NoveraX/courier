#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { setProjectRoot } from "./context";
import { createDevToolsServer } from "./server";
import { initProject } from "./server/init";

const init = defineCommand({
  meta: {
    name: "init",
    description: "Initialize project: create registry.nexus.json, update .gitignore",
  },
  run() {
    setProjectRoot(process.cwd());
    initProject();
    console.log("  ✓ registry.nexus.json created (if missing)");
    console.log("  ✓ .nexus-cache.json added to .gitignore");
  },
});

const main = defineCommand({
  meta: {
    name: "nexus-devtools",
    description: "Nexus DevTools — standalone inspection & debugging server",
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
    const host = args.host;
    const projectRoot = args.cwd || process.cwd();

    createDevToolsServer({
      port,
      host,
      projectRoot,
      onReady: async (url) => {
        console.log(`\n  Nexus DevTools running at ${url}\n`);
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
