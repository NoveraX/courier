/**
 * Next.js, as its server layers resolve the two markers React code carries:
 * `server-only` is an empty module there, and `client-only` an error. The
 * route handlers and server components that use a project's API modules
 * run on those layers, and so do its definitions when Courier reads them.
 */

import type { FrameworkRules, ModuleRule } from "./resolution-profile";

/** What Next's server layers answer for the markers of server and browser code. */
export const NEXT_RULES: FrameworkRules = {
  modules: new Map<string, ModuleRule>([
    ["server-only", { kind: "empty" }],
    [
      "client-only",
      {
        kind: "refused",
        reason:
          "is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read",
        remedy:
          "Import that code from a client component alone, out of the modules courier.config imports",
      },
    ],
  ]),
};
