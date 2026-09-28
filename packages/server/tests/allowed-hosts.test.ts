/**
 * The host names a standalone server answers to, on every transport.
 *
 * A DNS-rebinding page points its own name at the machine the server runs
 * on, and its calls then look same-origin to the browser. The server is told
 * its own names with `allowedHosts`; outside production it serves only
 * loopback names and IP literals until it is told more.
 */
import { request as httpRequest } from "node:http";

import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { createCourierServer } from "../src/create-server";
import type { CourierServer, CourierServerOptions } from "../src/types";

const { endpoint, channel } = courier();
let server: CourierServer | undefined;
const clients: WebSocket[] = [];

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const client of clients.splice(0)) client.terminate();
  await server?.stop();
  server = undefined;
});

async function serve(options: Partial<CourierServerOptions> = {}): Promise<number> {
  const feed = channel.response<string>().implement(async function* () {
    yield "hello";
    await new Promise(() => {});
  });
  const api = defineApi({
    baseURL: "http://127.0.0.1:1",
    endpoints: { ping: endpoint.get("ping"), feed },
  });
  server = createCourierServer({ sources: { api }, port: 0, signals: false, ...options });
  return Number(new URL(await server.ready).port);
}

/** A GET addressed to `host`, as a browser on that name sends it. */
function get(port: number, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: "/api/request?_s=api&_m=ping", headers: { host } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** The code a socket addressed to `host` is closed with, or "open". */
function socketOutcome(port: number, host: string): Promise<number | "open"> {
  const client = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, { headers: { host } });
  clients.push(client);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("open"), 500);
    client.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("a host the server was not told about", () => {
  it("is answered 421 over HTTP, naming the option that admits it", async () => {
    const port = await serve();

    const answer = await get(port, `rebound.example:${port}`);

    expect(answer.status).toBe(421);
    expect(JSON.parse(answer.body)).toMatchObject({ code: "HOST_NOT_ALLOWED" });
    expect(JSON.parse(answer.body).message).toContain("allowedHosts");
  });

  it("has its socket closed with 4421", async () => {
    const port = await serve();

    expect(await socketOutcome(port, `rebound.example:${port}`)).toBe(4421);
  });

  it("is served in production, where the operator routes the names", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const port = await serve();

    expect((await get(port, "app.example.com")).status).not.toBe(421);
  });
});

describe("a host allowedHosts names", () => {
  it("is served over HTTP and WebSocket alike", async () => {
    const port = await serve({ allowedHosts: ["app.example.com"] });

    expect((await get(port, "app.example.com")).status).not.toBe(421);
    expect(await socketOutcome(port, "app.example.com")).toBe("open");
    expect((await get(port, "rebound.example")).status).toBe(421);
  });

  it("leaves loopback names served", async () => {
    const port = await serve({ allowedHosts: ["app.example.com"] });

    expect((await get(port, `localhost:${port}`)).status).not.toBe(421);
  });
});
