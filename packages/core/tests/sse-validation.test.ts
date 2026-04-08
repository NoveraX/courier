import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHandler } from "../src/adapter";
import { endpoint } from "../src/define/endpoint";
import type { SSEContext, SSEEvent } from "../src/realtime/types";

function sseRequest(params: string): Request {
  return new Request(`http://localhost/api/sse?${params}`, {
    headers: { Accept: "text/event-stream" },
  });
}

async function collectSSEText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("SSE variable validation", () => {
  it("validates variables against endpoint schema", async () => {
    const vars = z.object({ userId: z.string() });
    const feed = endpoint({ transport: "sse", variables: vars })(async function* (ctx) {
      yield { data: ctx.variables };
    });

    const sources = { api: { options: {}, feed } };
    const handler = createHandler(sources);

    const valid = await handler.handleSSE(sseRequest("_s=api&_m=feed&userId=abc"));
    expect(valid.status).toBe(200);

    const invalid = await handler.handleSSE(sseRequest("_s=api&_m=feed"));
    expect(invalid.status).toBe(400);
    const body = await invalid.json();
    expect(body.message).toBe("Invalid SSE variables");
  });

  it("coerces string query params to numbers via z.coerce", async () => {
    const schema = z.object({ limit: z.coerce.number() });
    const feed = endpoint({ transport: "sse", variables: schema })(async function* (ctx) {
      yield { data: ctx.variables };
    });

    const sources = { api: { options: {}, feed } };
    const handler = createHandler(sources);

    const response = await handler.handleSSE(sseRequest("_s=api&_m=feed&limit=42"));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"limit":42');
  });

  it("coerces string query params to booleans via z.coerce", async () => {
    const schema = z.object({ active: z.coerce.boolean() });
    const feed = endpoint({ transport: "sse", variables: schema })(async function* (ctx) {
      yield { data: ctx.variables };
    });

    const sources = { api: { options: {}, feed } };
    const handler = createHandler(sources);

    const response = await handler.handleSSE(sseRequest("_s=api&_m=feed&active=true"));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"active":true');
  });

  it("passes raw variables when no schema defined", async () => {
    const feed = endpoint<unknown>({ transport: "sse" })(async function* (ctx: SSEContext) {
      yield { data: ctx.variables } as SSEEvent;
    });
    const sources = { api: { options: {}, feed } };
    const handler = createHandler(sources);

    const response = await handler.handleSSE(sseRequest("_s=api&_m=feed&foo=bar"));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"foo":"bar"');
  });

  it("returns 400 for invalid coercion", async () => {
    const schema = z.object({ count: z.coerce.number().min(1) });
    const feed = endpoint({ transport: "sse", variables: schema })(async function* (ctx) {
      yield { data: ctx.variables };
    });

    const sources = { api: { options: {}, feed } };
    const handler = createHandler(sources);

    const response = await handler.handleSSE(sseRequest("_s=api&_m=feed&count=abc"));
    expect(response.status).toBe(400);
  });
});
