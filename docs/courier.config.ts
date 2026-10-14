import { defineConfig } from "@noverax/courier/config"

import { sources } from "./src/api"

/**
 * The APIs the site's examples call through its /api/request route, as
 * Studio reads them: it writes the routes their pages take into
 * src/lib/routes.ts.
 */
export default defineConfig({
  sources,
  studio: { routes: "src/lib/routes.ts" },
})
