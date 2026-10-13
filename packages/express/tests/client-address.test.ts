/**
 * The user's address a call through the Express proxy route tells its upstream
 * in `X-Forwarded-For`: the socket's own address, the chain a proxy in
 * front recorded kept before it when the socket is that proxy's.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { echo, startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { courierHandler } from "../src/index";

const { endpoint } = courier();

let upstream: Upstream | undefined;
let app: Server | undefined;

afterEach(async () => {
  await upstream?.close();
  app?.closeAllConnections();
  await new Promise<void>((resolve) => (app ? app.close(() => resolve()) : resolve()));
  upstream = undefined;
  app = undefined;
  _resetSourcesForTests();
});

describe("the Express proxy route", () => {
  it("keeps the chain the proxy on this machine recorded, and appends the proxy", async () => {
    upstream = await startUpstream(echo);
    const api = defineApi({ baseURL: upstream.url, endpoints: { ping: endpoint.post("ping") } });
    const proxy = courierHandler({ sources: { api } });
    app = createServer((req, res) => void proxy(req, res));
    await new Promise<void>((resolve) => app?.listen(0, "127.0.0.1", resolve));

    await fetch(
      `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/request?_s=api&_m=ping`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.23, 203.0.113.50",
        },
        body: JSON.stringify({}),
      },
    );

    expect(upstream.received[0]?.headers["x-forwarded-for"]).toBe(
      "198.51.100.23, 203.0.113.50, 127.0.0.1",
    );
  });
});
