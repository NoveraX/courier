import { defineConfig } from "@noverax/courier/config";

import { api } from "./src/api";

/** Read by `courier-server` and by Courier Studio. */
export default defineConfig({
  sources: { api },
  server: { port: 3001 },
});
