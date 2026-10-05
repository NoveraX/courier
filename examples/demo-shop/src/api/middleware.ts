import { randomUUID } from "node:crypto";
import {
  authMiddleware,
  cacheMiddleware,
  defineMiddleware,
  retryMiddleware,
} from "@noverax/courier/middleware";
import { z } from "zod";

import { PORTS } from "../ports";

const IssuedKey = z.object({ token: z.string() });

/** Tags each call with an id the upstream logs, so one request is found on both sides. */
export const requestId = defineMiddleware("requestId", "before", (ctx) => {
  ctx.headers.set("x-request-id", `req_${randomUUID().slice(0, 8)}`);
});

/** The catalog changes rarely: its answers are kept for five seconds. */
export const catalogCache = cacheMiddleware({ scope: "public", ttl: 5_000 });

let shopKey: Promise<string> | undefined;

/* The shop issues a service key that lasts 45 s; a failed issue is not kept. */
function issueShopKey(): Promise<string> {
  const issued = fetch(`http://127.0.0.1:${PORTS.shop}/auth/token`, { method: "POST" }).then(
    async (response) => {
      if (!response.ok) throw new Error(`The shop issued no key: ${response.status}`);
      return IssuedKey.parse(await response.json()).token;
    },
  );
  shopKey = issued;
  issued.catch(() => {
    if (shopKey === issued) shopKey = undefined;
  });
  return issued;
}

/**
 * The shop's service key on every call that needs one: kept until the shop
 * answers 401, then issued again and the call sent once more.
 */
export const shopAuth = authMiddleware({
  getToken: () => shopKey ?? issueShopKey(),
  refreshToken: issueShopKey,
});

/** The payments provider's secret key, as a server holds it. */
export const paymentsAuth = authMiddleware({ getToken: () => "sk_demo_shop" });

/**
 * A charge the provider could not reach the card network for is sent again,
 * twice at most. It writes, so it is retried only because it is told to.
 */
export const paymentsRetry = retryMiddleware({
  limit: 2,
  delay: 250,
  retryOn: [502, 503],
  mutations: true,
});
