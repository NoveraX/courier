/**
 * A small shop API served over real HTTP on a loopback port, and its
 * definition with four endpoints offered to agents and one kept from them.
 * Every request the API receives is recorded, so a test can say a
 * destructive call never reached it.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { defineMiddleware, type MiddlewareContext } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();

export const Order = z.object({
  id: z.string(),
  status: z.enum(["open", "shipped", "cancelled"]),
  total: z.number(),
});

/** What the API received, one `METHOD /path` per request. */
export interface ShopUpstream {
  readonly baseURL: string;
  readonly received: string[];
  close(): Promise<void>;
}

export async function startShopUpstream(): Promise<ShopUpstream> {
  const received: string[] = [];
  const server: Server = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    const send = (status: number, body?: unknown) => {
      response.writeHead(status, body === undefined ? {} : { "content-type": "application/json" });
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const url = new URL(request.url ?? "/", "http://shop");
    if (request.method === "GET" && url.pathname === "/orders/7")
      return send(200, { id: "7", status: "open", total: 42 });
    if (request.method === "GET" && url.pathname === "/orders/broken")
      return send(500, { message: "The database is down" });
    if (request.method === "GET" && url.pathname === "/orders")
      return send(200, [{ id: "7", status: "open", total: 42 }]);
    if (request.method === "POST" && url.pathname === "/orders")
      return send(201, { id: "8", status: "open", total: 10 });
    if (request.method === "DELETE" && url.pathname.startsWith("/orders/")) return send(204);
    return send(404, { message: "No such route" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Every middleware context an agent's call ran through, in order. */
export const seenByMiddleware: MiddlewareContext[] = [];

/* A rule as an application writes one: an intern's agent reads, and does nothing else. */
const internsRead = defineMiddleware("interns-read", "wrap", async (ctx, next) => {
  seenByMiddleware.push(ctx);
  if (ctx.agent?.principal === "intern" && ctx.agent.access !== "read") {
    return {
      status: 403,
      data: { message: "An intern's agent only reads" },
      headers: new Headers(),
    };
  }
  return next();
});

export function shopApi(baseURL: string) {
  return defineApi({
    name: "shop",
    baseURL,
    middleware: [internsRead],
    groups: {
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          get: endpoint
            .get(":id")
            .variables(z.object({ id: z.string() }))
            .response(Order)
            .agent({
              description: "One order by its id, with its status and total",
              access: "read",
              title: "Order",
            }),
          list: endpoint
            .get("")
            .response(z.array(Order))
            .agent({ description: "Every open order", access: "read" }),
          create: endpoint
            .post("")
            .variables(z.object({ total: z.number().positive() }))
            .response(Order)
            .agent({ description: "Place an order for a total", access: "write" }),
          cancel: endpoint
            .del(":id")
            .variables(z.object({ id: z.string() }))
            .agent({ description: "Cancel an order that has not shipped", access: "destructive" }),
          report: endpoint.get("report"),
        },
      }),
    },
  });
}
