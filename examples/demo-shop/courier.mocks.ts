import { defineMockServer, defineMocks, defineScenario } from "@noverax/courier-mock";

import { payments } from "./src/api/payments";
import { shop } from "./src/api/shop";
import { PORTS } from "./src/ports";

/**
 * Two mocks Studio starts with the demo: the whole shop, with data and
 * scenarios to switch to, and the payments provider answering charges only —
 * every other payments call goes to the provider itself. Their requests
 * show in Studio, not in the terminal.
 */
export default defineMocks({
  shop: defineMockServer({
    source: shop,
    port: PORTS.shopMock,
    autoStart: true,
    log: "silent",
    seed: { count: 8 },
    scenarios: {
      "checkout-declined": defineScenario<typeof shop>("checkout-declined", (mock) => {
        mock("orders", "place").rejects(402, { message: "Payment declined" });
      }),
      "sold-out": defineScenario<typeof shop>("sold-out", (mock) => {
        mock("products", "list").resolves([]);
        mock("cart", "add").rejects(409, { message: "Out of stock" });
      }),
    },
  }),
  payments: defineMockServer({
    source: payments,
    port: PORTS.paymentsMock,
    autoStart: true,
    log: "silent",
    endpoints: ["charges.create"],
    scenarios: {
      "gateway-down": defineScenario<typeof payments>("gateway-down", (mock) => {
        mock("charges", "create").rejects(502, { message: "Payment gateway unavailable" });
      }),
    },
  }),
});
