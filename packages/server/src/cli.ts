#!/usr/bin/env node

import { createLogger } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { defineCommand, runMain } from "citty";

const log = createLogger("CLI");

const main = defineCommand({
  meta: {
    name: "nexus-server",
    description: "Standalone HTTP + WebSocket server for @noverax/nexus",
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
      description: "Path to Nexus config file (e.g. nexus.config.ts)",
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
        log.error("Config must export `sources` — a record of Nexus API sources.");
        process.exit(1);
      }
    } catch (err) {
      log.error(`Failed to load config: ${args.config}`, err);
      process.exit(1);
    }

    const { createNexusServer } = await import("./create-server");

    createNexusServer({
      sources: sources as Sources,
      port,
      host: args.host,
      onReady: (url) => {
        log.info(`Nexus Server ready at ${url}`);
      },
    });
  },
});

runMain(main);
