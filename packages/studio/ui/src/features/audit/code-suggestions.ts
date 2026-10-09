/**
 * The code the Audit view offers to copy for a fix.
 *
 * Each is a whole module written against Courier's published API, so it
 * compiles as it is pasted; `./api/sources` stands for the module the
 * project's API is defined in.
 */

export const CACHE_SUGGESTION = `import { courier } from "@noverax/courier/define";
import { cacheMiddleware } from "@noverax/courier/middleware";

const { endpoint } = courier();

// A read whose answer is the same for every caller, kept for a minute:
export const getConfig = endpoint
  .get("config")
  .use(cacheMiddleware({ scope: "public", ttl: 60_000 }))
  .response<{ version: number }>();
`;

export const RETRY_SUGGESTION = `import { courier } from "@noverax/courier/define";

const { endpoint } = courier();

// Tried again, up to 3 times, when the upstream fails or does not answer:
export const listOrders = endpoint
  .get("orders")
  .retry({ limit: 3, backoff: "exponential", retryOn: [0, 502, 503, 504] })
  .response<{ id: string }[]>();
`;

export const IDEMPOTENCY_SUGGESTION = `import { courier } from "@noverax/courier/define";

const { endpoint } = courier();

export const placeOrder = endpoint
  .post("orders", { idempotencyKey: "header:Idempotency-Key" })
  .retry({ limit: 3 })
  .response<{ id: string }>();
`;

export const TIMEOUT_SUGGESTION = `import { courier } from "@noverax/courier/define";

const { endpoint } = courier();

// Give up after 5 seconds instead of waiting on a slow upstream:
export const monthlyReport = endpoint
  .get("reports/monthly")
  .timeout(5_000)
  .response<{ total: number }>();
`;

export const RESPONSE_SCHEMA_SUGGESTION = `import { courier } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();

// The answer is checked against the schema before the caller gets it:
export const getUser = endpoint
  .get("users/:id")
  .variables<{ id: string }>()
  .response(z.object({ id: z.string(), name: z.string() }));
`;

export const VARIABLES_SCHEMA_SUGGESTION = `import { courier } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();

// The variables are checked before anything is sent:
export const getUser = endpoint
  .get("users/:id")
  .variables(z.object({ id: z.string().min(1) }))
  .response<{ id: string; name: string }>();
`;

export const AUTH_SUGGESTION = `import { courier, defineApi } from "@noverax/courier/define";
import { authMiddleware } from "@noverax/courier/middleware";

const { endpoint } = courier();

// Every request carries the token in its Authorization header:
export const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [authMiddleware({ getToken: () => sessionStorage.getItem("token") ?? "" })],
  endpoints: {
    createOrder: endpoint.post("orders").variables<{ sku: string }>().response<{ id: string }>(),
  },
});
`;

export const HEADER_TOKEN_SUGGESTION = `import { courier, defineApi } from "@noverax/courier/define";
import { authMiddleware } from "@noverax/courier/middleware";

const { endpoint } = courier();

// The token travels in a header, never in the URL, where logs and history keep it:
export const api = defineApi({
  baseURL: "https://api.example.com",
  middleware: [authMiddleware({ getToken: () => sessionStorage.getItem("token") ?? "" })],
  endpoints: {
    orders: endpoint.get("orders").response<{ id: string }[]>(),
  },
});
`;

export const PROXY_SUGGESTION = `import { createProxyCaller } from "@noverax/courier";
import type { api } from "./api/sources";

// Imported as a type: the API definition — upstream URL, endpoint paths,
// middleware, secrets — stays on the server.
export const caller = createProxyCaller<typeof api>("api", { proxyPath: { http: "/api/request" } });
`;
