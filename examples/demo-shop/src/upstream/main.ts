import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { OrderEvent } from "../api/schemas";
import { PORTS } from "../ports";
import { type Answer, readRequest, send, type UpstreamRequest } from "./http";
import { answerPayments } from "./payments-routes";
import { answerShop } from "./shop-routes";
import { keepOrdersMoving, orderEvents } from "./shop-state";

/* A comment line now and then keeps an idle stream open through proxies. */
const HEARTBEAT_MS = 15_000;

const TOO_LARGE: Answer = [413, { message: "The body is larger than this backend reads" }];

/* Backends that know nothing of Courier: they could as well be written in FastAPI or Go. */
function listen(port: number, answer: (req: UpstreamRequest) => Promise<Answer>): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/live/orders" && port === PORTS.shop) {
      streamOrders(req, res);
      return;
    }
    readRequest(req)
      .then((request) => (request ? answer(request) : TOO_LARGE))
      .then(
        (answered) => send(req, res, answered),
        (error: unknown) => {
          console.error("The upstream failed to answer", error);
          send(req, res, [500, { message: "Internal error" }]);
        },
      );
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/* Server-sent events, as any backend sends them: each order that moves, until the caller leaves. */
function streamOrders(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const onEvent = (event: OrderEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(": still here\n\n"), HEARTBEAT_MS);
  orderEvents.on("event", onEvent);
  req.on("close", () => {
    clearInterval(heartbeat);
    orderEvents.off("event", onEvent);
  });
}

keepOrdersMoving();
await listen(PORTS.shop, answerShop);
await listen(PORTS.payments, answerPayments);
console.log(
  `Shop at http://127.0.0.1:${PORTS.shop}, payments at http://127.0.0.1:${PORTS.payments}`,
);
