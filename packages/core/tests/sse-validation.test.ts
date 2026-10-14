import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import type { SSEContext, SSEEvent } from "../src/realtime/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { stream } = courier();

function setupHandler(sources: unknown) {
  registerSources(sources as Parameters<typeof registerSources>[0]);
  return createHandler();
}

afterEach(() => {
  _resetSourcesForTests();
});

function sseRequest(params: string): Request {
  return new Request(`http://localhost/api/sse?${params}`, {
    headers: { Accept: "text/event-stream" },
  });
}

/** `_s=api&_m=feed` plus the variables, encoded the way the proxy client sends them. */
function feedRequest(variables?: Record<string, unknown>): Request {
  const vars = variables ? `&_v=${encodeURIComponent(JSON.stringify(variables))}` : "";
  return sseRequest(`_s=api&_m=feed${vars}`);
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
    const feed = stream
      .variables(vars)
      .response<unknown>()
      .implement(async function* (ctx) {
        yield { data: ctx.variables };
      });

    const sources = { api: { options: { expose: true }, feed } };
    const handler = setupHandler(sources);

    const valid = await handler.handleSSE(feedRequest({ userId: "abc" }));
    expect(valid.status).toBe(200);

    const invalid = await handler.handleSSE(feedRequest());
    expect(invalid.status).toBe(422);
    const body = await invalid.json();
    expect(body).toMatchObject({ success: false, target: "variables" });
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("receives a number as a number, with no coercion", async () => {
    const schema = z.object({ limit: z.number() });
    const feed = stream
      .variables(schema)
      .response<unknown>()
      .implement(async function* (ctx) {
        yield { data: ctx.variables };
      });

    const sources = { api: { options: { expose: true }, feed } };
    const handler = setupHandler(sources);

    const response = await handler.handleSSE(feedRequest({ limit: 42 }));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"limit":42');
  });

  it("receives a boolean as a boolean, with no coercion", async () => {
    const schema = z.object({ active: z.boolean() });
    const feed = stream
      .variables(schema)
      .response<unknown>()
      .implement(async function* (ctx) {
        yield { data: ctx.variables };
      });

    const sources = { api: { options: { expose: true }, feed } };
    const handler = setupHandler(sources);

    const response = await handler.handleSSE(feedRequest({ active: true }));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"active":true');
  });

  it("passes raw variables when no schema defined", async () => {
    const feed = stream.response<unknown>().implement(async function* (ctx: SSEContext) {
      yield { data: ctx.variables } as SSEEvent;
    });
    const sources = { api: { options: { expose: true }, feed } };
    const handler = setupHandler(sources);

    const response = await handler.handleSSE(feedRequest({ foo: "bar" }));
    expect(response.status).toBe(200);

    const text = await collectSSEText(response);
    expect(text).toContain('"foo":"bar"');
  });

  it("returns 422 for a value the schema rejects, as an HTTP call does", async () => {
    const schema = z.object({ count: z.number().min(1) });
    const feed = stream
      .variables(schema)
      .response<unknown>()
      .implement(async function* (ctx) {
        yield { data: ctx.variables };
      });

    const sources = { api: { options: { expose: true }, feed } };
    const handler = setupHandler(sources);

    const response = await handler.handleSSE(feedRequest({ count: "abc" }));
    expect(response.status).toBe(422);
  });
});
