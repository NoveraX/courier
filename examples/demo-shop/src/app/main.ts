import { createCourierServer } from "@noverax/courier-server";
import { attachRuntime } from "@noverax/courier-studio-core/runtime";

import { payments } from "../api/payments";
import { shop } from "../api/shop";
import { PORTS } from "../ports";

/* The shop's own server: Courier's proxy in front of the shop's backend,
   which a page reaches only through it and only at the endpoints the
   boundary names; it keeps the deals stream and the support chat itself.
   It serves the payments provider too, which no page may call. Attached to
   Studio, its requests show in the Timeline, and the Playground sends
   through it. */
await attachRuntime("shop-server");
await new Promise<void>((resolve) => {
  createCourierServer({
    sources: { shop, payments },
    port: PORTS.app,
    host: "127.0.0.1",
    onReady: () => resolve(),
  });
});
console.log(`The shop's server at http://127.0.0.1:${PORTS.app}`);
