import { PORTS } from "../ports";
import { chance, pick } from "./random";

const SHOP_MOCK = `http://127.0.0.1:${PORTS.shopMock}`;
const PAYMENTS_MOCK = `http://127.0.0.1:${PORTS.paymentsMock}`;
const JSON_HEADERS = { "content-type": "application/json", authorization: "Bearer sk_demo_shop" };

/* A call to a mock, as a page under development makes it; a mock that is stopped answers nothing. */
async function call(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function idsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "object" && item !== null && "id" in item && typeof item.id === "string"
      ? [item.id]
      : [],
  );
}

/**
 * One round of the calls a front end under development makes to the mocks:
 * the shop's catalog and cart, an order now and then, and a charge — which
 * the payments mock answers — and a lookup it passes to the provider.
 *
 * @returns When the round is over
 * @example
 * ```ts
 * await driveMocks();
 * ```
 */
export async function driveMocks(): Promise<void> {
  const ids = idsOf(await call(`${SHOP_MOCK}/products`));
  if (ids.length > 0) await call(`${SHOP_MOCK}/products/${pick(ids)}`);
  const body = JSON.stringify({ sku: "DE-1035", qty: 1 });
  await call(`${SHOP_MOCK}/cart/dev/items`, { method: "POST", headers: JSON_HEADERS, body });
  if (chance(0.3)) {
    const order = JSON.stringify({ shopper: "dev" });
    await call(`${SHOP_MOCK}/orders`, { method: "POST", headers: JSON_HEADERS, body: order });
  }
  if (chance(0.15)) await call(`${SHOP_MOCK}/products/p_99`);
  if (chance(0.4)) {
    const charge = JSON.stringify({ orderId: "o_dev", amount: 129 });
    await call(`${PAYMENTS_MOCK}/charges`, { method: "POST", headers: JSON_HEADERS, body: charge });
    await call(`${PAYMENTS_MOCK}/charges/ch_unknown`, { headers: JSON_HEADERS });
  }
}
