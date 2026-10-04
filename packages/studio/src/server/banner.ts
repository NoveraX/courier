/**
 * The startup banner: Studio's version, how long it took to start, and the
 * addresses it answers at.
 *
 * Colour and the screen reset are for a terminal. Written into a pipe — a
 * log file, CI, `concurrently`, turbo — the reset wiped the other processes'
 * output and every line carried escape codes, so both need a TTY, and
 * colour follows the same decision as every log line: FORCE_COLOR, then
 * NO_COLOR and TERM=dumb, then the terminal. With COURIER_LOG_FORMAT=json
 * the banner is a log line, so the output stays one JSON object per line.
 */

import { createLogger } from "@noverax/courier";
import { formatBanner, readLogFormat, styleFor } from "@noverax/courier/internal";
import { startupIssues } from "./startup-issues";
import type { StudioUrls } from "./studio-urls";

const log = createLogger("Studio");

/* The links carry the project's token; a page opened without it can only look. */
const TOKEN_NOTE = "Open a link above: without its token a page can only look.";

/**
 * Print the banner, and restate any problem already reported during startup.
 *
 * @param version - Studio's version.
 * @param urls - Where Studio answers.
 * @example
 * ```ts
 * printBanner(studioVersion(), withToken(studioUrls(host, port), server.token));
 * ```
 */
export function printBanner(version: string, urls: StudioUrls): void {
  const addresses = [...(urls.local === undefined ? [] : [urls.local]), ...urls.network];
  if (readLogFormat().json) {
    log.info(`Courier Studio v${version} ready at ${addresses.join(", ")}`);
    return;
  }
  const issues = startupIssues();
  /* Clearing wipes the scrollback too, so anything already reported would be
     unrecoverable rather than merely scrolled away. A clean start earns a
     clean screen; a start with problems keeps its history, and restates
     them under the banner, where they are not missed. */
  if (issues.length === 0 && process.stdout.isTTY === true) {
    process.stdout.write("\x1bc\x1b[3J\x1b[2J\x1b[H");
  }
  const rows = [
    ...(urls.local === undefined ? [] : [{ label: "Local", value: urls.local }]),
    ...urls.network.map((value) => ({ label: "Network", value })),
  ];
  const banner = {
    product: "Courier Studio",
    version,
    readyInMs: performance.now(),
    rows,
    note: TOKEN_NOTE,
    issues,
  };
  console.log(formatBanner(banner, styleFor(process.stdout)));
}
