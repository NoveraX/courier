#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { defineCommand, runMain } from "citty";
import { loadCliConfig } from "./load-cli-config";
import { parsePort } from "./parse-port";
import { serverVersion } from "./server-version";

const log = createLogger("CLI");

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "localhost";

/** Stop with a line naming the problem, followed by the error behind it when there is one. */
function fail(message: string, cause?: unknown): never {
  log.error(message, cause);
  process.exit(1);
}

const main = defineCommand({
  meta: {
    name: "courier-server",
    version: serverVersion(),
    description: "Standalone HTTP + WebSocket server for @noverax/courier",
  },
  args: {
    port: {
      type: "string",
      description: `Server port (falls back to server.port, then ${DEFAULT_PORT})`,
    },
    host: {
      type: "string",
      description: `Server host (falls back to server.host, then ${DEFAULT_HOST})`,
    },
    config: {
      type: "string",
      description:
        "Config file, relative to the working directory (default: courier.config.* there)",
    },
    "allowed-origins": {
      type: "string",
      description:
        "Comma-separated origins browser apps may call from (falls back to server.allowedOrigins)",
    },
  },
  async run({ args }) {
    if (args._.length > 0) fail(`Unknown command "${args._[0]}". Run courier-server --help.`);

    const loaded = await loadCliConfig(process.cwd(), args.config).catch((error: unknown) =>
      fail("courier.config could not be loaded", error),
    );
    if ("problem" in loaded) fail(loaded.problem);
    const { config, configFile } = loaded;
    const block = config.server ?? {};

    const port =
      args.port !== undefined
        ? parsePort(args.port, "--port")
        : block.port !== undefined
          ? parsePort(String(block.port), `server.port in ${configFile}`)
          : DEFAULT_PORT;
    if (port instanceof Error) fail(port.message);

    const origins = args["allowed-origins"];
    const allowedOrigins =
      origins === undefined
        ? block.allowedOrigins
        : origins
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);

    const { createCourierServer } = await import("./create-server");
    createCourierServer({
      sources: config.sources as Sources,
      port,
      host: args.host ?? block.host ?? DEFAULT_HOST,
      ...(allowedOrigins === undefined ? {} : { allowedOrigins: [...allowedOrigins] }),
      onReady: (url) => {
        log.info(`Courier Server ready at ${url}`);
      },
      /* The server has logged why; the exit status is what a supervisor or a
         deploy script reads, and it used to say 0. */
      onServerError: () => {
        process.exitCode = 1;
      },
    });
  },
});

runMain(main);
