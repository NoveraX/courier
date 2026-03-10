#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { createDevToolsServer } from "./server.js";

const main = defineCommand({
  meta: {
    name: "nexus-devtools",
    description: "Nexus DevTools — standalone inspection & debugging server",
  },
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
    open: {
      type: "boolean",
      description: "Open browser on start",
      default: false,
    },
  },
  async run({ args }) {
    const port = Number.parseInt(args.port, 10);
    const host = args.host;

    createDevToolsServer({
      port,
      host,
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
