import { createCourierServer } from "@noverax/courier-server";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";

import { shop } from "./shop";

/* The app's own server, as Studio sees it: attached, and serving Courier's
   proxy for the shop, so the Playground sends its calls through it. */
await attachRuntime();
createCourierServer({
  sources: { shop },
  port: Number(process.env.COURIER_E2E_APP_PORT ?? 3000),
  host: "127.0.0.1",
  onReady: () => console.log("app ready"),
});
