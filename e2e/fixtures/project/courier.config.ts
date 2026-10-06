import { defineConfig } from "@noverax/courier/config";

import { shop } from "./src/shop";

/** The project the browser tests drive: Studio and its mocks listen where the test says. */
export default defineConfig({
  sources: { shop },
  studio: {
    port: Number(process.env.COURIER_E2E_STUDIO_PORT ?? 6280),
    mockBasePort: Number(process.env.COURIER_E2E_MOCK_PORT ?? 7001),
  },
});
