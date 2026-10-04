#!/usr/bin/env node

import { createLogger } from "@noverax/courier";
import { formatHelp, helpOptions, styleFor } from "@noverax/courier/internal";
import { unknownConfigKeys } from "@noverax/courier-studio-core/config";
import { type ArgsDef, defineCommand, runMain } from "citty";
import { listOption } from "./list-option";
import { loadCliConfig } from "./load-cli-config";
import { parseByteLimit } from "./parse-byte-limit";
import { parsePort } from "./parse-port";
import { printReady } from "./print-ready";
import { serverVersion } from "./server-version";
import { stopOnFatal } from "./stop-on-fatal";

const log = createLogger("CLI");

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "127.0.0.1";

/** Stop with a line naming the problem, followed by the error behind it when there is one. */
function fail(message: string, cause?: unknown): never {
  log.error(message, cause);
  process.exit(1);
}

const SUMMARY = "Standalone HTTP, SSE and WebSocket server for Courier";

const ARGS = {
  port: {
    type: "string",
    valueHint: "port",
    description: `Server port (falls back to server.port, then ${DEFAULT_PORT})`,
  },
  host: {
    type: "string",
    valueHint: "host",
    description: `Server host (falls back to server.host, then ${DEFAULT_HOST})`,
  },
  config: {
    type: "string",
    valueHint: "file",
    description: "Config file, relative to the working directory (default: courier.config.* there)",
  },
  "allowed-origins": {
    type: "string",
    valueHint: "origins",
    description:
      "Comma-separated origins browser apps may call from (falls back to server.allowedOrigins)",
  },
  "allowed-hosts": {
    type: "string",
    valueHint: "hosts",
    description:
      "Comma-separated host names the server is reached by (falls back to server.allowedHosts)",
  },
} as const satisfies ArgsDef;

/* citty's own help colours a pipe and a log file; this one follows the
   terminal, as every line the server prints does. */
async function printHelp(): Promise<void> {
  const help = {
    product: "Courier Server",
    version: serverVersion(),
    summary: SUMMARY,
    command: "courier-server",
    options: helpOptions(ARGS),
  };
  console.log(formatHelp(help, styleFor(process.stdout)));
}

const main = defineCommand({
  meta: { name: "courier-server", version: serverVersion(), description: SUMMARY },
  args: ARGS,
  async run({ args }) {
    if (args._.length > 0) fail(`Unknown command "${args._[0]}". Run courier-server --help.`);

    const loaded = await loadCliConfig(process.cwd(), args.config).catch((error: unknown) =>
      fail("courier.config could not be loaded", error),
    );
    if ("problem" in loaded) fail(loaded.problem);
    const { config, configFile } = loaded;
    const unread = unknownConfigKeys(config);
    if (unread.length > 0) {
      log.warn(
        `${configFile} has keys Courier does not read: ${unread.join(", ")}; check their spelling`,
      );
    }
    const block = config.server ?? {};

    const port =
      args.port !== undefined
        ? parsePort(args.port, "--port")
        : block.port !== undefined
          ? parsePort(String(block.port), `server.port in ${configFile}`)
          : DEFAULT_PORT;
    if (port instanceof Error) fail(port.message);

    const allowedOrigins = listOption(args["allowed-origins"], block.allowedOrigins);
    const allowedHosts = listOption(args["allowed-hosts"], block.allowedHosts);

    const maxBodyBytes = parseByteLimit(block.maxBodyBytes, `server.maxBodyBytes in ${configFile}`);
    if (maxBodyBytes instanceof Error) fail(maxBodyBytes.message);
    const maxUploadBytes = parseByteLimit(
      block.maxUploadBytes,
      `server.maxUploadBytes in ${configFile}`,
    );
    if (maxUploadBytes instanceof Error) fail(maxUploadBytes.message);

    const { createCourierServer } = await import("./create-server");
    const server = createCourierServer({
      sources: config.sources,
      port,
      host: args.host ?? block.host ?? DEFAULT_HOST,
      maxBodyBytes,
      maxUploadBytes,
      allowedOrigins,
      allowedHosts,
      onReady: (url) => printReady({ url, configFile, sources: Object.keys(config.sources) }),
      /* The server has logged why; the exit status is what a supervisor or a
         deploy script reads, so it must not say 0. */
      onServerError: () => {
        process.exitCode = 1;
      },
    });
    stopOnFatal(() => server.stop());
  },
});

runMain(main, { showUsage: printHelp });
