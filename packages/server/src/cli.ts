#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { defineCommand, runMain } from "citty";

const log = createLogger("CLI");

const main = defineCommand({
  meta: {
    name: "courier-server",
    description: "Standalone HTTP + WebSocket server for @noverax/courier",
  },
  args: {
    port: {
      type: "string",
      description: "Server port",
      default: "3001",
    },
    host: {
      type: "string",
      description: "Server host",
      default: "localhost",
    },
    config: {
      type: "string",
      description: "Path to Courier config file (e.g. courier.config.ts)",
      required: true,
    },
  },
  async run({ args }) {
    const port = Number.parseInt(args.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      log.error(`Invalid port: "${args.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }

    let sources: Record<string, unknown>;
    try {
      const mod = await import(args.config);
      sources = mod.sources ?? mod.default?.sources;
      if (!sources || typeof sources !== "object") {
        log.error("Config must export `sources` — a record of Courier API sources.");
        process.exit(1);
      }
    } catch (err) {
      log.error(`Failed to load config: ${args.config}`, err);
      process.exit(1);
    }

    const { createCourierServer } = await import("./create-server");

    createCourierServer({
      sources: sources as Sources,
      port,
      host: args.host,
      onReady: (url) => {
        log.info(`Courier Server ready at ${url}`);
      },
    });
  },
});

runMain(main);
