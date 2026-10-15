/**
 * A read answered without a request of its own tells Studio so: one that
 * joined the identical read already in flight, or one the render had read
 * already, ends with `shared` naming the call whose request answered it.
 * The call that sent the request ends without it, and the calls' own ids,
 * different as they are, never keep two identical reads apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests } from "../src/sources";
import { studioHooks } from "../src/studio";
import { type RenderMemo, registerRenderMemo } from "../src/utils/render-memo";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();

let upstream: Upstream;
const started = vi.fn();
const ended = vi.fn();
const failed = vi.fn();

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    setTimeout(() => {
      if (request.url.startsWith("/broken")) {
        res.writeHead(502, { "content-type": "application/json" }).end('{"message":"down"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end('{"title":"Home"}');
    }, 40);
  });
  studioHooks.onRequestStart = started;
  studioHooks.onRequestEnd = ended;
  studioHooks.onRequestError = failed;
});

afterEach(async () => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onRequestEnd = undefined;
  studioHooks.onRequestError = undefined;
  vi.clearAllMocks();
  _resetSourcesForTests();
  await upstream.close();
});

function shop() {
  return createCaller(
    defineApi({
      name: "shop",
      baseURL: upstream.url,
      endpoints: {
        seo: endpoint.get("seo").variables<{ path: string }>().response<{ title: string }>(),
        broken: endpoint.get("broken"),
      },
    }),
  );
}

/* Each call's end, by the order its call started, with the id Studio gave it. */
function endsInStartOrder(
  events: ReturnType<typeof vi.fn>,
): Array<{ id: string; shared?: unknown }> {
  const ids = started.mock.calls.map(([event]) => (event as { id: string }).id);
  const byId = new Map(
    events.mock.calls.map(([event]) => [(event as { id: string }).id, event as { id: string }]),
  );
  return ids.map((id) => byId.get(id) ?? { id });
}

describe("a read that joins the identical one in flight", () => {
  it("ends naming the call whose request answered it, and the API is asked once", async () => {
    const api = shop();

    await Promise.all([api.seo({ path: "/" }), api.seo({ path: "/" })]);

    const [first, second] = endsInStartOrder(ended);
    expect(upstream.received).toHaveLength(1);
    expect(first).not.toHaveProperty("shared");
    expect(second?.shared).toEqual({ by: "flight", with: first?.id });
  });

  it("ends in failure naming the call whose request failed, when the answer was an error", async () => {
    const api = shop();

    const outcomes = await Promise.allSettled([api.broken(), api.broken()]);

    const [first, second] = endsInStartOrder(failed);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected"]);
    expect(upstream.received).toHaveLength(1);
    expect(first).not.toHaveProperty("shared");
    expect(second?.shared).toEqual({ by: "flight", with: first?.id });
  });

  it("is never named for a read that went alone", async () => {
    const api = shop();

    await api.seo({ path: "/" });
    await api.seo({ path: "/" });

    expect(upstream.received).toHaveLength(2);
    expect(ended.mock.calls.map(([event]) => event)).not.toContainEqual(
      expect.objectContaining({ shared: expect.anything() }),
    );
  });
});

describe("a read the render had made already", () => {
  let unregister: () => void;

  beforeEach(() => {
    const render: RenderMemo = new Map();
    unregister = registerRenderMemo(() => render);
  });

  afterEach(() => unregister());

  it("ends naming the call that read it first, however much later it comes", async () => {
    const api = shop();

    await api.seo({ path: "/" });
    await api.seo({ path: "/" });

    const [first, second] = endsInStartOrder(ended);
    expect(upstream.received).toHaveLength(1);
    expect(first).not.toHaveProperty("shared");
    expect(second?.shared).toEqual({ by: "render", with: first?.id });
  });
});
