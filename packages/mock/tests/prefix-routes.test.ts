import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineApi, defineGroup, courier } from "@noverax/courier/define";
import { createAutoMockServer } from "../src/auto/create-auto-server";

const { endpoint } = courier();

const products = defineGroup({
  prefix: "products",
  endpoints: {
    getAll: endpoint.get(""),
    getById: endpoint.get(":id"),
    create: endpoint.post(""),
  },
});

const api = defineApi({
  baseURL: "https://api.example.com",
  groups: { products },
});

describe("prefix routes (GET /products)", () => {
  const server = createAutoMockServer({
    source: api,
    port: 0,
    log: false,
    studio: false,
  });

  let baseUrl: string;

  beforeAll(async () => {
    const info = await server.start();
    baseUrl = info.url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("GET /products returns seeded list", async () => {
    const res = await fetch(`${baseUrl}/products`);
    console.log("GET /products status:", res.status);
    const body = await res.json();
    console.log("Body:", JSON.stringify(body).slice(0, 200));
    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("GET /products/1 returns single record", async () => {
    const res = await fetch(`${baseUrl}/products/1`);
    console.log("GET /products/1 status:", res.status);
    const body = await res.json();
    console.log("Body:", JSON.stringify(body).slice(0, 200));
    expect(res.status).toBe(200);
  });
});
