/**
 * Every specification the parse route reads is read in a thread of its own:
 * however large, however its YAML is shaped, it holds up nothing else, and
 * its thread is ended at its budget of time and memory or once its caller
 * goes. A caller without the token is read for in one of a few places, or
 * refused; a caller with it waits its turn among a few more.
 */
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../../src/apis/parser/parse-spec";
import { readSpecInThread } from "../../src/server/spec-thread/read-spec-in-thread";
import { SpecTextError } from "../../src/server/spec-thread/spec-text-error";
import { SpecWorkLimitError } from "../../src/server/spec-thread/spec-work-limit-error";
import {
  MIN_THREAD_HEAP_MB,
  TRUSTED_JOB,
  VISITOR_READ,
} from "../../src/server/spec-thread/thread-budgets";
import { TRUSTED_JOBS, VISITOR_JOBS } from "../../src/server/spec-thread/thread-places";
import { SpecTooLargeError } from "../../src/server/spec-too-large-error";
import { StudioBusyError } from "../../src/server/studio-busy-error";

const PETS = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  servers: [{ url: "/v2" }],
  paths: {
    "/pets": { get: { operationId: "listPets", responses: { "200": { description: "ok" } } } },
  },
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* YAML that takes the thread a second or more to read: a mapping of many keys. */
function slowYaml(keys = 400_000): string {
  const lines = Array.from({ length: keys }, (_, n) => `  k${n}: 1`).join("\n");
  return `openapi: 3.0.0\ninfo: {title: Slow, version: '1'}\npaths: {}\nx:\n${lines}`;
}

function failureOf(reading: Promise<unknown>): Promise<unknown> {
  return reading.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/* The threads asked to end so far, or posted a job: a thread whose `threadId` is -1 has stopped running. */
function threadsCalling(method: "terminate" | "postMessage"): () => Worker[] {
  const calls = vi.spyOn(Worker.prototype, method);
  return () => calls.mock.contexts.filter((worker): worker is Worker => worker instanceof Worker);
}

describe("readSpecInThread", () => {
  it("answers with the specification as the parse route sends it", async () => {
    const json = await readSpecInThread({ text: PETS }, { trusted: true });

    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(parseSpec(PETS))));
  });

  it("makes the server address absolute against the URL the text came from", async () => {
    const json = await readSpecInThread(
      { text: PETS, url: "https://pets.example/api/openapi.json" },
      { trusted: false },
    );

    expect(JSON.parse(json)).toMatchObject({ baseURL: "https://pets.example/v2" });
  });

  it("says why a text is no specification, as the parser put it", async () => {
    const failure = await failureOf(
      readSpecInThread(
        { text: "openapi: 3.0.0\ninfo: {title: a, version: '1'}\npaths: {}\npaths: {}\n" },
        { trusted: false },
      ),
    );

    expect(failure).toBeInstanceOf(SpecTextError);
    expect(failure).toMatchObject({ httpStatus: 400 });
    expect(String((failure as Error).message)).toMatch(
      /^Map keys must be unique at line 4, column 1/,
    );
  });

  it("refuses a specification larger, as JSON, than its caller can send back", async () => {
    const failure = await failureOf(
      readSpecInThread({ text: PETS }, { trusted: false, maxBytes: 64 }),
    );

    expect(failure).toBeInstanceOf(SpecTooLargeError);
    expect(failure).toMatchObject({ httpStatus: 413, code: "SPEC_TOO_LARGE" });
  });

  it("stops a read that takes longer than its budget, and ends its thread", async () => {
    const ended = threadsCalling("terminate");
    const started = Date.now();

    const failure = await failureOf(
      readSpecInThread({ text: slowYaml() }, { trusted: true, budget: { ms: 200, heapMb: 4096 } }),
    );

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(failure).toMatchObject({ httpStatus: 413, code: "SPEC_WORK_LIMIT" });
    expect(Date.now() - started).toBeLessThan(2_000);
    await vi.waitUntil(() => ended().length === 1 && ended()[0]?.threadId === -1);
  });

  it("stops a read that takes more memory than its budget", async () => {
    const failure = await failureOf(
      readSpecInThread(
        { text: slowYaml() },
        { trusted: true, budget: { ms: 60_000, heapMb: MIN_THREAD_HEAP_MB } },
      ),
    );

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain(`${MIN_THREAD_HEAP_MB} MB`);
  });

  it("stops a read once its caller goes away, and ends its thread", async () => {
    const posted = threadsCalling("postMessage");
    const ended = threadsCalling("terminate");
    const caller = new AbortController();
    const reading = failureOf(
      readSpecInThread({ text: slowYaml() }, { trusted: true, signal: caller.signal }),
    );
    await vi.waitUntil(() => posted().length === 1);
    const started = Date.now();

    caller.abort(new Error("gone"));

    expect(await reading).toMatchObject({ message: "gone" });
    expect(Date.now() - started).toBeLessThan(500);
    await vi.waitUntil(() => ended().length === 1 && ended()[0]?.threadId === -1);
  });

  it("refuses a budget below the heap a thread needs, before starting one", async () => {
    const posted = threadsCalling("postMessage");

    const failure = await failureOf(
      readSpecInThread({ text: PETS }, { trusted: true, budget: { ms: 1_000, heapMb: 2 } }),
    );

    expect(failure).toBeInstanceOf(RangeError);
    expect(posted()).toEqual([]);
  });

  it(`reads ${VISITOR_JOBS} at once for callers without the token, and refuses one more as busy`, async () => {
    const ended = threadsCalling("terminate");
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const reading = callers.map((caller) =>
      failureOf(readSpecInThread({ text: slowYaml() }, { trusted: false, signal: caller.signal })),
    );

    const one = await failureOf(readSpecInThread({ text: PETS }, { trusted: false }));
    const host = await readSpecInThread({ text: PETS }, { trusted: true });
    for (const caller of callers) caller.abort();
    await Promise.all(reading);
    /* A place is given back once its thread has exited, not once its caller has gone. */
    await vi.waitUntil(() => ended().every((thread) => thread.threadId === -1), {
      timeout: 5_000,
    });

    expect(one).toBeInstanceOf(StudioBusyError);
    expect(JSON.parse(host)).toMatchObject({ title: "Pets" });
    expect(await readSpecInThread({ text: PETS }, { trusted: false })).toBe(host);
  });

  it(`reads ${TRUSTED_JOBS} at once for callers with the token, and has one more wait its turn`, async () => {
    const callers = Array.from({ length: TRUSTED_JOBS }, () => new AbortController());
    const reading = callers.map((caller) =>
      failureOf(readSpecInThread({ text: slowYaml() }, { trusted: true, signal: caller.signal })),
    );
    let answered = false;
    const waiting = readSpecInThread({ text: PETS }, { trusted: true }).then((json) => {
      answered = true;
      return json;
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    const whileFull = answered;
    callers[0]?.abort();

    expect(whileFull).toBe(false);
    expect(JSON.parse(await waiting)).toMatchObject({ title: "Pets" });
    for (const caller of callers) caller.abort();
    await Promise.all(reading);
  });

  it("gives a caller without the token less time and memory than one with it", () => {
    expect(VISITOR_READ.ms).toBeLessThan(TRUSTED_JOB.ms);
    expect(VISITOR_READ.heapMb).toBeLessThan(TRUSTED_JOB.heapMb);
  });
});
