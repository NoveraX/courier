import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

import { PORTS } from "../ports";
import { paymentsAuth, paymentsRetry, requestId } from "./middleware";
import { Charge, Refund } from "./schemas";

const { endpoint } = courier();

const charges = defineGroup({
  prefix: "charges",
  endpoints: {
    create: endpoint
      .post("")
      .variables(z.object({ orderId: z.string(), amount: z.number().min(0) }))
      .response(Charge),
    get: endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(Charge),
  },
});

const refunds = defineGroup({
  prefix: "refunds",
  endpoints: {
    create: endpoint
      .post("")
      .variables(z.object({ chargeId: z.string() }))
      .response(Refund),
  },
});

/**
 * The payments provider, which only the shop's server calls, with its
 * secret key. The server serves it — so Studio's Playground reaches it —
 * yet its proxy refuses every one of its endpoints to a page.
 */
export const payments = defineApi({
  baseURL: `http://127.0.0.1:${PORTS.payments}`,
  expose: false,
  middleware: [requestId, paymentsAuth, paymentsRetry],
  groups: { charges, refunds },
});
