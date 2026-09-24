/**
 * Who the mock wizard's routes answer, and how: a page without an Origin is
 * refused, a malformed body is a 400, values that are not what they claim
 * never reach a snippet, a caller on another machine gets lines to add built
 * from nothing but its own request, and an unexpected failure is a 500.
 */
import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { registerMockDeclareRoutes } from "../src/server/mock-declare-routes";
import type { MocksEditContext } from "../src/server/mocks-edit/mocks-edit-context";

type Handler = (req: IncomingMessage & { body: unknown }, res: FakeResponse) => void;

interface FakeResponse {
  status(code: number): FakeResponse;
  json(data: unknown): void;
}

function mount(ctx: MocksEditContext): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  registerMockDeclareRoutes({ post: (path, handler) => routes.set(path, handler as Handler) }, ctx);
  return routes;
}

async function call(handler: Handler | undefined, body: unknown, headers: Record<string, string>, remoteAddress: string) {
  let status = 200;
  let payload: unknown;
  const done = new Promise<void>((resolve) => {
    const res: FakeResponse = {
      status(code) {
        status = code;
        return res;
      },
      json(data) {
        payload = data;
        resolve();
      },
    };
    const req = { headers, body, socket: { remoteAddress } } as unknown as IncomingMessage & { body: unknown };
    handler?.(req, res);
  });
  await done;
  return { status, body: payload as Record<string, unknown> };
}

const declaration = { key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: false };
const ORIGIN = { origin: "http://localhost:6280" };

function context(overrides: Partial<MocksEditContext> = {}): MocksEditContext {
  return {
    projectRoot: "/nonexistent-project",
    mockBasePort: 7001,
    watcher: vi.fn(() => null),
    studioPort: () => 6280,
    mockSummaries: () => [],
    ...overrides,
  };
}

describe("the mock wizard's routes", () => {
  it("refuse a caller that sends no Origin", async () => {
    const preview = mount(context()).get("/api/mocks/declare/preview");

    const reply = await call(preview, { mocks: [declaration] }, {}, "127.0.0.1");

    expect(reply.status).toBe(403);
  });

  it("answer a body of the wrong shape with 400", async () => {
    const preview = mount(context()).get("/api/mocks/declare/preview");

    const reply = await call(preview, { mocks: [{ key: "a" }] }, ORIGIN, "127.0.0.1");

    expect(reply.status).toBe(400);
  });

  it("report a key that is not an identifier as a field error, before any snippet carries it", async () => {
    const preview = mount(context()).get("/api/mocks/declare/preview");
    const injected = { ...declaration, key: 'a"]});require("x")//' };

    const reply = await call(preview, { mocks: [injected] }, ORIGIN, "10.9.9.9");

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ status: "invalid", errors: [{ index: 0, field: "key" }] });
    expect(JSON.stringify(reply.body)).not.toContain("snippet");
  });

  it("give a caller on another machine lines to add, reading nothing of the project", async () => {
    const ctx = context();
    const preview = mount(ctx).get("/api/mocks/declare/preview");

    const reply = await call(preview, { mocks: [declaration] }, ORIGIN, "10.9.9.9");

    expect(reply.body).toMatchObject({ status: "manual", target: null, creates: false, reasons: [{ code: "NOT_LOCAL_PEER" }] });
    expect(String(reply.body.snippet)).toContain("apiMock: defineMockServer({ source: courierConfig.sources.api })");
    expect(String(reply.body.snippet)).not.toContain("export default");
    expect(ctx.watcher).not.toHaveBeenCalled();
  });

  it("answer an unexpected failure with a JSON 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const apply = mount(
      context({
        watcher: () => {
          throw new Error("watcher gone");
        },
      }),
    ).get("/api/mocks/declare/apply");

    const reply = await call(apply, { mocks: [declaration], baseHash: null, planDigest: "a".repeat(64) }, ORIGIN, "::1");

    expect(reply).toEqual({ status: 500, body: { error: "Studio could not apply adding the mocks: watcher gone" } });
    vi.restoreAllMocks();
  });
});
