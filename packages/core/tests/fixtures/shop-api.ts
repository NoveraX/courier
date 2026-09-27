import { courier, defineApi, defineGroup } from "../../src/define/index";
import { shopBoundary } from "./shop-boundary";

const { endpoint } = courier();

/** The API the boundary gates, handed its boundary as the docs wire it. */
export const shop = defineApi({
  name: "shop",
  baseURL: process.env.SHOP_API_URL,
  boundary: shopBoundary,
  groups: {
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        list: endpoint.get("").response<{ id: number }[]>(),
        purge: endpoint.del("purge").response<null>(),
      },
    }),
  },
});
