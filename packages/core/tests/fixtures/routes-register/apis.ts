import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

/* A shop a page calls through the proxy, all but its refunds. */
export const shop = defineApi({
  name: "shop",
  baseURL: "https://shop.example.com",
  expose: true,
  groups: {
    cart: defineGroup({
      prefix: "cart",
      endpoints: {
        get: endpoint.get("").response<{ items: string[] }>(),
        add: endpoint.post("items").variables<{ productId: number }>(),
      },
    }),
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        list: endpoint.get("").response<{ id: number }[]>(),
        refund: endpoint.post(":id/refund").expose(false),
      },
    }),
  },
});

/* A payments provider only the server calls. */
export const payments = defineApi({
  name: "payments",
  baseURL: "https://pay.example.com",
  groups: {
    charges: defineGroup({ prefix: "charges", endpoints: { create: endpoint.post("") } }),
  },
});

/* A vendor's API made by a factory, its expose forwarded from settings that may leave it out. */
export function vendorApi(settings: { expose?: boolean }) {
  return defineApi({
    name: "vendor",
    baseURL: "https://vendor.example.com",
    expose: settings.expose,
    endpoints: { ping: endpoint.get("ping") },
  });
}
