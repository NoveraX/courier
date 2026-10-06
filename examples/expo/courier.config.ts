import { defineConfig } from "@noverax/courier/config";

import { shopApi } from "./src/api";

/** Read by Courier Studio, which runs the mock the app calls. */
export default defineConfig({
  sources: { shop: shopApi("http://localhost:7020") },
  studio: { port: 6310 },
});
