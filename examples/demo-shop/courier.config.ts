import { defineConfig } from "@noverax/courier/config";

import { payments } from "./src/api/payments";
import { shop } from "./src/api/shop";
import { PORTS } from "./src/ports";

/** Read by the shop's server, by Studio, and by every process that attaches to Studio. */
export default defineConfig({
  sources: { shop, payments },
  server: { port: PORTS.app },
  studio: { port: PORTS.studio, mockBasePort: PORTS.shopMock },
});
