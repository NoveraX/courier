import { relative } from "node:path";
import { createLogger } from "@noverax/courier";
import {
  formatBanner,
  type OutputStream,
  readLogFormat,
  styleFor,
} from "@noverax/courier/internal";
import { serverVersion } from "./server-version";

const log = createLogger("CLI");

/* More names than this make the row a paragraph; the rest are counted. */
const SOURCES_SHOWN = 4;

/** What the command says once the server listens. */
export interface Ready {
  readonly url: string;
  /** The config it serves, as an absolute path. */
  readonly configFile: string;
  /** The names of the sources it serves. */
  readonly sources: readonly string[];
}

function sourceList(sources: readonly string[]): string {
  const shown = sources.slice(0, SOURCES_SHOWN).join(", ");
  const more = sources.length - SOURCES_SHOWN;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

/**
 * Say that the server is up: in a terminal, a banner with its version, how
 * long it took, its address, its config and its sources; anywhere else — a
 * pipe, a container's log, COURIER_LOG_FORMAT=json — one log line, so the
 * log stays a log.
 *
 * @param ready - Where it listens, and what it serves
 * @param stdout - Where the banner goes; `process.stdout` unless a test stands in
 * @example
 * ```ts
 * printReady({ url, configFile, sources: Object.keys(config.sources) });
 * ```
 */
export function printReady(ready: Ready, stdout: OutputStream = process.stdout): void {
  const version = serverVersion();
  if (stdout.isTTY !== true || readLogFormat().json) {
    log.info(`Courier Server v${version} ready at ${ready.url}`);
    return;
  }
  const banner = {
    product: "Courier Server",
    version,
    readyInMs: performance.now(),
    rows: [
      { label: "Local", value: ready.url },
      { label: "Config", value: relative(process.cwd(), ready.configFile) || ready.configFile },
      { label: "Sources", value: sourceList(ready.sources) },
    ],
  };
  console.log(formatBanner(banner, styleFor(stdout)));
}
