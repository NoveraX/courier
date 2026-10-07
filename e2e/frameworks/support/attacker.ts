import { createServer } from "node:http";

import { listen, type Served } from "./listen";

/**
 * Another site: its page links to an address of the application, which the
 * checks open as a user following a link elsewhere would.
 *
 * @returns The running site; `/link?to=<address>` shows the link, as `#go`
 * @example
 * ```ts
 * await page.goto(`${attacker.url}/link?to=${encodeURIComponent(`${app}/attack`)}`);
 * ```
 */
export function startAttacker(): Promise<Served> {
  const server = createServer((req, res) => {
    const to = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("to") ?? "";
    const href = to.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><meta charset="utf-8"><a id="go" href="${href}">a link elsewhere</a>`);
  });
  return listen(server);
}
