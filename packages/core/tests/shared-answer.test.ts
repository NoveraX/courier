/**
 * A read answered without a request of its own tells Studio so: one that
 * joined the identical read already in flight, or one the render had read
 * already, ends with `shared` naming the call whose request answered it.
 * The request belongs to the call that still waits for it when its answer
 * comes: the one that sent it, or, once that one has left, the first that
 * joined after. A call that left is never shared, a retry's last attempt
 * alone decides, the answer's shape is handed to Studio once, by the call
 * whose request brought it, and the calls' own ids, different as they are,
 * never keep two identical reads apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests } from "../src/sources";
import { studioHooks } from "../src/studio";
import { type RenderMemo, registerRenderMemo } from "../src/utils/render-memo";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();

let upstream: Upstream;
let flakyHits = 0;
const started = vi.fn();
const ended = vi.fn();
const failed = vi.fn();
const answered = vi.fn();

beforeEach(async () => {
  flakyHits = 0;
  upstream = await startUpstream((request, res) => {
    setTimeout(() => {
      if (request.url.startsWith("/flaky")) {
        flakyHits += 1;
        const status = flakyHits === 1 ? 503 : 200;
        res.writeHead(status, { "content-type": "application/json" }).end('{"title":"Home"}');
        return;
      }
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
  studioHooks.onAnswer = answered;
});

afterEach(async () => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onRequestEnd = undefined;
  studioHooks.onRequestError = undefined;
  studioHooks.onAnswer = undefined;
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
        checked: endpoint.get("seo").response(z.object({ title: z.string() })),
        broken: endpoint.get("broken"),
        flaky: endpoint.get("flaky"),
        flakyRetry: endpoint.get("flaky").retry({ limit: 2, backoff: "fixed", delay: 10 }),
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

  it("ends naming the call whose request got no answer at all, when nothing answered", async () => {
    const down = createCaller(
      defineApi({
        name: "down",
        baseURL: "http://127.0.0.1:9",
        endpoints: { seo: endpoint.get("seo") },
      }),
    );

    const outcomes = await Promise.allSettled([down.seo(), down.seo()]);

    const [first, second] = endsInStartOrder(failed);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "rejected"]);
    expect(first).not.toHaveProperty("shared");
    expect(second?.shared).toEqual({ by: "flight", with: first?.id });
  });

  it("belongs, once the call that sent it has left, to the first call still waiting", async () => {
    const api = shop();
    const leaving = new AbortController();

    const first = api.seo.with({ signal: leaving.signal })({ path: "/" });
    const second = api.seo({ path: "/" });
    const third = api.seo({ path: "/" });
    setTimeout(() => leaving.abort(), 10);
    const outcomes = await Promise.allSettled([first, second, third]);

    const [, owner, joined] = endsInStartOrder(ended);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(upstream.received).toHaveLength(1);
    expect(owner).not.toHaveProperty("shared");
    expect(joined?.shared).toEqual({ by: "flight", with: owner?.id });
  });

  it("is never named for a call that left before its answer came", async () => {
    const api = shop();
    const leaving = new AbortController();

    const first = api.seo({ path: "/" });
    const second = api.seo.with({ signal: leaving.signal })({ path: "/" });
    setTimeout(() => leaving.abort(), 10);
    await Promise.allSettled([first, second]);

    const left = failed.mock.calls
      .map(([event]) => event as { error: { type: string } })
      .filter((event) => event.error.type === "aborted");
    expect(left).toHaveLength(1);
    expect(left[0]).not.toHaveProperty("shared");
  });

  it("is decided again on each attempt a retry makes: the last one alone tells", async () => {
    const api = shop();

    const outcomes = await Promise.allSettled([api.flaky(), api.flakyRetry()]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["rejected", "fulfilled"]);
    expect(upstream.received).toHaveLength(2);
    const [, retried] = endsInStartOrder(ended);
    expect(retried).toMatchObject({ status: 200 });
    expect(retried).not.toHaveProperty("shared");
  });

  it("hands Studio the answer's shape once, for the call whose request brought it", async () => {
    const api = shop();

    await Promise.all([api.checked(), api.checked(), api.checked()]);

    const [first] = endsInStartOrder(ended);
    expect(
      answered.mock.calls.map(([answer]) => (answer as { requestId: string }).requestId),
    ).toEqual([first?.id]);
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

  it("is answered once for two reads made together in it, the second naming the first", async () => {
    const api = shop();

    await Promise.all([api.seo({ path: "/" }), api.seo({ path: "/" })]);
    await api.seo({ path: "/" });

    const [first, second, third] = endsInStartOrder(ended);
    expect(upstream.received).toHaveLength(1);
    expect(first).not.toHaveProperty("shared");
    expect(second?.shared).toEqual({ by: "flight", with: first?.id });
    expect(third?.shared).toEqual({ by: "render", with: first?.id });
  });

  it("names, for a later read, the call its request belonged to when the first had left", async () => {
    const api = shop();
    const leaving = new AbortController();

    const first = api.seo.with({ signal: leaving.signal })({ path: "/" });
    const second = api.seo({ path: "/" });
    setTimeout(() => leaving.abort(), 10);
    await Promise.allSettled([first, second]);
    await api.seo({ path: "/" });

    const [, owner, later] = endsInStartOrder(ended);
    expect(upstream.received).toHaveLength(1);
    expect(owner).not.toHaveProperty("shared");
    expect(later?.shared).toEqual({ by: "render", with: owner?.id });
  });

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
