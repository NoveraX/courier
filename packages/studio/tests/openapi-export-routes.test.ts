/**
 * The APIs page's OpenAPI export: a source the running config declares is
 * written as `courier-studio openapi` writes it, in the version, title and
 * API version asked for, with every endpoint the document leaves out and
 * why. A source the config does not declare, a config not loaded yet and a
 * malformed ask are each refused, saying why.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi } from "@noverax/courier/define";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { registerOpenApiExportRoutes } from "../src/server/openapi-export/openapi-export-routes";

const { endpoint, channel } = courier();
const shop = defineApi({
  baseURL: "https://shop.example",
  endpoints: {
    order: endpoint
      .get("orders/:id")
      .variables(z.object({ id: z.string() }))
      .response(z.object({ id: z.string() })),
    search: endpoint.query("orders/search").variables(z.object({ q: z.string() })),
    room: channel.response(z.string()).via((ws) => ws.connect("room")),
  },
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

async function exportRoute(sources: Record<string, unknown> | null) {
  const app = express();
  app.use(express.json());
  const running = sources && { config: { sources } };
  registerOpenApiExportRoutes(app, { project: { snapshot: () => ({ running }) } } as never);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/openapi/document`;
  return async (body: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

describe("exporting a source as OpenAPI", () => {
  it("writes the document as the command does, with what it leaves out and why", async () => {
    const ask = await exportRoute({ shop });

    const { status, body } = await ask({ source: "shop" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ fileName: "shop.openapi.json", operations: 1 });
    expect(body.leftOut.map((one: { operation: string }) => one.operation)).toEqual([
      "search",
      "room",
    ]);
    const document = JSON.parse(body.text);
    expect(body.text).toBe(`${JSON.stringify(document, null, 2)}\n`);
    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: { title: "shop" },
      paths: { "/orders/{id}": { get: { operationId: "order" } } },
    });
  });

  it("writes the version, the title and the API version asked for", async () => {
    const ask = await exportRoute({ shop });

    const { body } = await ask({
      source: "shop",
      openapi: "3.2.0",
      title: " Shop API ",
      version: "2.4.0",
    });

    const document = JSON.parse(body.text);
    expect(document.openapi).toBe("3.2.0");
    expect(document.info).toMatchObject({ title: "Shop API", version: "2.4.0" });
    expect(document.paths["/orders/search"]?.query).toBeDefined();
    expect(body.operations).toBe(2);
    expect(body.leftOut.map((one: { operation: string }) => one.operation)).toEqual(["room"]);
  });

  it("refuses a source the config does not declare, a config not loaded, and a malformed ask", async () => {
    const ask = await exportRoute({ shop });
    const unloaded = await exportRoute(null);

    expect(await ask({ source: "billing" })).toEqual({
      status: 404,
      body: { error: 'courier.config declares no source "billing" — it declares shop.' },
    });
    expect(await ask({ source: "__proto__" })).toMatchObject({ status: 404 });
    expect(await unloaded({ source: "shop" })).toEqual({
      status: 409,
      body: { error: "Studio has not loaded courier.config yet." },
    });
    expect(await ask({})).toMatchObject({ status: 400 });
    expect(await ask({ source: "shop", openapi: "3.0.0" })).toEqual({
      status: 400,
      body: { error: "openapi is 3.1.0 or 3.2.0, not 3.0.0." },
    });
    expect(await ask({ source: "shop", title: "x".repeat(201) })).toMatchObject({ status: 400 });
  });
});
