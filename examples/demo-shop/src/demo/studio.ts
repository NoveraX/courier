import { createStudioServer } from "@noverax/courier-studio/server";

import { PORTS } from "../ports";

const resetsAt = Number(process.env.DEMO_RESETS_AT);
const origin = process.env.DEMO_ORIGIN;
const trustedProxies = (process.env.DEMO_TRUSTED_PROXIES ?? "")
  .split(",")
  .filter((entry) => entry.trim() !== "");
const addressHeader = process.env.DEMO_ADDRESS_HEADER || undefined;

/* Studio over the shop, as a public demo: a visitor reads everything, sends
   from the Playground and drives the mocks; the link with the token, printed
   here, is the host's. The public origin is the page's when Studio sits
   behind a proxy on a domain of its own; the trusted proxies are a CDN or a
   DDoS filter in front of that proxy, read past to each visitor's address,
   or read in the header they name it in. */
const studio = createStudioServer({
  host: process.env.STUDIO_HOST ?? "0.0.0.0",
  port: PORTS.studio,
  projectRoot: process.cwd(),
  demo: { ...(Number.isFinite(resetsAt) ? { resetsAt } : {}), trustedProxies, addressHeader },
  extraCorsOrigins: origin ? [origin] : [],
  onStarted: ({ url }) => {
    console.log(`Studio's demo at ${url}`);
    console.log(`The host's link, with the token: ${url}/#token=${studio.token}`);
  },
  onError: (error) => {
    console.error(error.message);
    process.exitCode = 1;
    void studio.close();
  },
});

/* A signal passed on again while Studio closes must not end it halfway; asked again later, it ends at once. */
let closingSince: number | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (closingSince !== undefined) {
      if (Date.now() - closingSince >= 1_000) process.exit(1);
      return;
    }
    closingSince = Date.now();
    studio
      .close()
      .catch((error: unknown) => console.error("Studio did not close cleanly", error))
      .finally(() => process.exit(0));
  });
}
