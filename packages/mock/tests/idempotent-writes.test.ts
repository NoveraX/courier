/**
 * A write sent again with its idempotency key — a retry, a double click —
 * gets the mock's first answer back and creates nothing twice, as an API
 * that deduplicates by the key answers; a write with no key, or with the
 * deduplication turned off, runs every time.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();
const Order = z.object({ id: z.number(), item: z.string() });
const running: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

function ordersApi(baseURL = "https://api.example") {
  return defineApi({
    baseURL,
    groups: {
      orders: defineGroup({
        prefix: "/orders",
        endpoints: {
          list: endpoint.get("").response(z.array(Order)),
          place: endpoint
            .post("", { idempotencyKey: "header:X-Request-Key" })
            .variables(z.object({ item: z.string() }))
            .response(Order),
        },
      }),
    },
  });
}

async function serve(idempotency?: false): Promise<string> {
  const server = createAutoMockServer({
    source: ordersApi(),
    port: 0,
    log: false,
    seed: { count: 0 },
    ...(idempotency === false && { idempotency }),
  });
  running.push(server);
  return (await server.start()).url;
}

function place(url: string, item: string, key?: { name: string; value: string }) {
  return fetch(`${url}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key && { [key.name]: key.value }) },
    body: JSON.stringify({ item }),
  });
}

async function count(url: string): Promise<number> {
  return ((await (await fetch(`${url}/orders`)).json()) as unknown[]).length;
}

describe("a write sent again with its idempotency key", () => {
  it("gets the first answer back, marked replayed, and creates one record", async () => {
    const url = await serve();
    const key = { name: "Idempotency-Key", value: "order-1" };

    const first = await place(url, "lamp", key);
    const again = await place(url, "lamp", key);

    expect(again.status).toBe(first.status);
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(await count(url)).toBe(1);
  });

  it("reads the key from the header the endpoint declares, and refuses it with other variables", async () => {
    const url = await serve();
    const key = { name: "x-request-key", value: "order-2" };

    await place(url, "lamp", key);
    const other = await place(url, "desk", key);

    expect(other.status).toBe(422);
    expect(await count(url)).toBe(1);
  });

  it("runs a write with no key, and every write once deduplication is off, every time", async () => {
    const plain = await serve();
    await place(plain, "lamp");
    await place(plain, "lamp");
    const off = await serve(false);
    await place(off, "lamp", { name: "Idempotency-Key", value: "order-3" });
    await place(off, "lamp", { name: "Idempotency-Key", value: "order-3" });

    expect([await count(plain), await count(off)]).toEqual([2, 2]);
  });

  it("keeps a client's two sends of one call to one record, through Courier", async () => {
    const url = await serve();
    const shop = createCaller(ordersApi(url));
    const send = () =>
      shop.with({ headers: { "x-request-key": "checkout-7" } }).orders.place({ item: "lamp" });

    const [one, two] = [await send(), await send()];

    expect(two).toEqual(one);
    expect(await count(url)).toBe(1);
  });
});
