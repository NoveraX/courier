/**
 * Where a whole body is searched: in a worker of its own, one search at a
 * time, a search whose view has moved on skipped; or on the page where no
 * worker can start, or once the one there stops — the searches that waited
 * on it told their body is missing, so the page sends it again — and what
 * lets a body go once no view shows it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A worker as the page sees one: what it was sent, and what listens to it. */
class FakeWorker {
  static made: FakeWorker[] = [];
  readonly posted: unknown[] = [];
  readonly listeners = new Map<string, (event: unknown) => void>();
  constructor() {
    FakeWorker.made.push(this);
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.listeners.clear();
  }
}

/* The client keeps its worker as long as the page lives: each test loads it afresh. */
async function freshClient() {
  vi.resetModules();
  return import("@/features/requests/whole-search-client");
}

const ASK = {
  key: "request:s1:r1:response",
  text: '{"city":"Kazan"}',
  query: "kaz",
  mode: "tree",
} as const;

beforeEach(() => {
  FakeWorker.made = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("askWholeSearch", () => {
  it("sends a search to a worker of its own", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { askWholeSearch } = await freshClient();

    void askWholeSearch(ASK);

    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]?.posted).toEqual([{ ...ASK, id: 1 }]);
  });

  it("sends one search at a time, and skips one whose view has moved on by its turn", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { askWholeSearch } = await freshClient();
    const movedOn = new AbortController();
    const first = askWholeSearch(ASK);
    const skipped = askWholeSearch({ ...ASK, text: undefined, query: "ka" }, movedOn.signal);
    const third = askWholeSearch({ ...ASK, text: undefined, query: "kazan" });
    const worker = FakeWorker.made[0];

    expect(worker?.posted).toEqual([{ ...ASK, id: 1 }]);
    movedOn.abort();
    worker?.listeners.get("message")?.({ data: { id: 1, ok: true, result: undefined } });

    expect(await first).toEqual({ id: 1, ok: true, result: undefined });
    expect(await skipped).toMatchObject({ id: 2, ok: false, error: expect.any(String) });
    expect(worker?.posted).toEqual([
      { ...ASK, id: 1 },
      { ...ASK, text: undefined, query: "kazan", id: 3 },
    ]);
    worker?.listeners.get("message")?.({ data: { id: 3, ok: false, missing: true } });
    expect(await third).toEqual({ id: 3, ok: false, missing: true });
  });

  it("searches on the page, and says so, when a worker cannot start", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new DOMException("This page may not start workers.", "SecurityError");
        }
      },
    );
    const { askWholeSearch } = await freshClient();

    const reply = await askWholeSearch(ASK);

    expect(reply).toMatchObject({ ok: true, result: { count: 1, matches: ["city"] } });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("The search worker could not start"),
      expect.any(DOMException),
    );
  });

  it("tells a search that waited on a worker that stopped that its body is missing, and searches on the page after", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { askWholeSearch } = await freshClient();
    const waited = askWholeSearch(ASK);

    FakeWorker.made[0]?.listeners.get("error")?.(new Event("error"));

    expect(await waited).toEqual({ id: 1, ok: false, missing: true });
    expect(await askWholeSearch(ASK)).toMatchObject({ ok: true, result: { count: 1 } });
    expect(FakeWorker.made).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("The search worker stopped"),
      expect.any(Event),
    );
  });
});

describe("forgetWholeBody", () => {
  it("tells the worker to let a body go", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { askWholeSearch, forgetWholeBody } = await freshClient();
    void askWholeSearch(ASK);

    forgetWholeBody(ASK.key);

    expect(FakeWorker.made[0]?.posted.at(-1)).toEqual({ forget: ASK.key });
  });

  it("lets a body the page holds go, so the next search over it sends it again", async () => {
    const { askWholeSearch, forgetWholeBody } = await freshClient();
    await askWholeSearch(ASK);

    forgetWholeBody(ASK.key);

    expect(await askWholeSearch({ ...ASK, text: undefined })).toMatchObject({
      ok: false,
      missing: true,
    });
  });
});
