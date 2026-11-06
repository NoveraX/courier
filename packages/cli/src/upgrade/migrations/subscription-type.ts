import { moveImports } from "../codemod/move-imports";
import type { Migration } from "../migration";

const REALTIME = "@noverax/courier/realtime";

/**
 * 0.5.0: every subscription, stream and channel is one `Subscription`,
 * which `WSChannel` extends; `SSESubscription` is gone for it.
 */
export const SUBSCRIPTION_TYPE: Migration = {
  id: "0.5.0/subscription-type",
  title: "names a stream's subscription Subscription",
  mentions: ["SSESubscription"],
  migrate: (file) => ({
    edits: moveImports(file, [
      { from: REALTIME, name: "SSESubscription", to: REALTIME, as: "Subscription" },
    ]),
    findings: [],
    packages: [],
  }),
};
