import { createServer } from "node:http";

import { listen, type Served } from "./listen";

/**
 * Another site: its page links to an address of the application, which the
 * checks open as a user following a link elsewhere would. It links to the
 * application alone: an address on any other origin is refused.
 *
 * @param application - The application's address, whose origin the links stay within
 * @returns The running site; `/link?to=<address>` shows the link, as `#go`
 * @example
 * ```ts
 * const attacker = await startAttacker(app);
 * await page.goto(`${attacker.url}/link?to=${encodeURIComponent(`${app}/attack`)}`);
 * ```
 */
export function startAttacker(application: string): Promise<Served> {
  const { origin } = new URL(application);
  const server = createServer((req, res) => {
    const to = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("to") ?? "";
    const target = URL.canParse(to) ? new URL(to) : undefined;
    if (target?.origin !== origin) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("This site links to the application alone.");
      return;
    }
    const href = target.href.replaceAll(/&/g, "&amp;").replaceAll(/"/g, "&quot;");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><meta charset="utf-8"><a id="go" href="${href}">a link elsewhere</a>`);
  });
  return listen(server);
}
