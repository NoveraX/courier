/**
 * Every specification the parse route reads is read in a process of its
 * own: however large, however its YAML is shaped, it holds up nothing
 * else, and its process is stopped at its budget of time and memory or
 * once its caller goes. A caller without the token is read for in one of a
 * few places, or refused; a caller with it waits its turn among a few more.
 */
import type * as ChildProcesses from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../../src/apis/parser/parse-spec";
import { MIN_JOB_HEAP_MB, TRUSTED_JOB, VISITOR_READ } from "../../src/server/spec-jobs/job-budgets";
import { TRUSTED_JOBS, VISITOR_JOBS } from "../../src/server/spec-jobs/job-places";
import { readSpecInProcess } from "../../src/server/spec-jobs/read-spec-in-process";
import { SpecTextError } from "../../src/server/spec-jobs/spec-text-error";
import { SpecWorkLimitError } from "../../src/server/spec-jobs/spec-work-limit-error";
import { SpecTooLargeError } from "../../src/server/spec-too-large-error";
import { StudioBusyError } from "../../src/server/studio-busy-error";
import type { Forked } from "../helpers/forked-processes";

const forks = vi.hoisted((): Forked[] => []);

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcesses>();
  const { recordingFork } = await import("../helpers/forked-processes");
  return { ...real, fork: recordingFork(real.fork, forks) };
});

const PETS = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  servers: [{ url: "/v2" }],
  paths: {
    "/pets": { get: { operationId: "listPets", responses: { "200": { description: "ok" } } } },
  },
});

beforeEach(() => {
  forks.splice(0);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await vi.waitUntil(() => forks.every((fork) => fork.closed), { timeout: 10_000 });
});

/* YAML that takes the process a second or more to read: a mapping of many keys. */
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

/* Once the first process started has been given its job: its time is counted from then. */
async function given(): Promise<number> {
  await vi.waitUntil(() => forks[0]?.sent.length === 1, { timeout: 10_000 });
  return Date.now();
}

describe("readSpecInProcess", () => {
  it("answers with the specification as the parse route sends it", async () => {
    const json = await readSpecInProcess({ text: PETS }, { trusted: true });

    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(parseSpec(PETS))));
  });

  it("makes the server address absolute against the URL the text came from", async () => {
    const json = await readSpecInProcess(
      { text: PETS, url: "https://pets.example/api/openapi.json" },
      { trusted: false },
    );

    expect(JSON.parse(json)).toMatchObject({ baseURL: "https://pets.example/v2" });
  });

  it("says why a text is no specification, as the parser put it", async () => {
    const failure = await failureOf(
      readSpecInProcess(
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
      readSpecInProcess({ text: PETS }, { trusted: false, maxBytes: 64 }),
    );

    expect(failure).toBeInstanceOf(SpecTooLargeError);
    expect(failure).toMatchObject({ httpStatus: 413, code: "SPEC_TOO_LARGE" });
  });

  it("stops a read that takes longer than its budget, and its process", async () => {
    const reading = failureOf(
      readSpecInProcess({ text: slowYaml() }, { trusted: true, budget: { ms: 200, heapMb: 4096 } }),
    );
    const started = await given();

    const failure = await reading;

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(failure).toMatchObject({ httpStatus: 413, code: "SPEC_WORK_LIMIT" });
    expect(Date.now() - started).toBeLessThan(2_000);
    await vi.waitUntil(() => forks.length === 1 && forks[0]?.closed);
  });

  it("stops a read that takes more memory than its budget", async () => {
    const failure = await failureOf(
      readSpecInProcess(
        { text: slowYaml() },
        { trusted: true, budget: { ms: 60_000, heapMb: MIN_JOB_HEAP_MB } },
      ),
    );

    expect(forks[0]?.sent).toHaveLength(1);
    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain(`${MIN_JOB_HEAP_MB} MB`);
  });

  it("reads a specification within the least heap a process is given", async () => {
    const json = await readSpecInProcess(
      { text: PETS },
      { trusted: true, budget: { ms: 10_000, heapMb: MIN_JOB_HEAP_MB } },
    );

    expect(JSON.parse(json)).toMatchObject({ title: "Pets" });
  });

  it("stops a read once its caller goes away, and its process", async () => {
    const caller = new AbortController();
    const reading = failureOf(
      readSpecInProcess({ text: slowYaml() }, { trusted: true, signal: caller.signal }),
    );
    await given();
    const started = Date.now();

    caller.abort(new Error("gone"));

    expect(await reading).toMatchObject({ message: "gone" });
    expect(Date.now() - started).toBeLessThan(500);
    await vi.waitUntil(() => forks.length === 1 && forks[0]?.closed);
  });

  it("refuses a budget below the heap a process needs, before starting one", async () => {
    const failure = await failureOf(
      readSpecInProcess({ text: PETS }, { trusted: true, budget: { ms: 1_000, heapMb: 2 } }),
    );

    expect(failure).toBeInstanceOf(RangeError);
    expect(forks).toEqual([]);
  });

  it(`reads ${VISITOR_JOBS} at once for callers without the token, and refuses one more as busy`, async () => {
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const reading = callers.map((caller) =>
      failureOf(readSpecInProcess({ text: slowYaml() }, { trusted: false, signal: caller.signal })),
    );

    const one = await failureOf(readSpecInProcess({ text: PETS }, { trusted: false }));
    const host = await readSpecInProcess({ text: PETS }, { trusted: true });
    for (const caller of callers) caller.abort();
    await Promise.all(reading);
    /* A place is given back once its process has ended, not once its caller has gone. */
    await vi.waitUntil(() => forks.every((fork) => fork.closed), { timeout: 5_000 });

    expect(one).toBeInstanceOf(StudioBusyError);
    expect(JSON.parse(host)).toMatchObject({ title: "Pets" });
    expect(await readSpecInProcess({ text: PETS }, { trusted: false })).toBe(host);
  });

  it(`reads ${TRUSTED_JOBS} at once for callers with the token, and has one more wait its turn`, async () => {
    const callers = Array.from({ length: TRUSTED_JOBS }, () => new AbortController());
    const reading = callers.map((caller) =>
      failureOf(readSpecInProcess({ text: slowYaml() }, { trusted: true, signal: caller.signal })),
    );
    let answered = false;
    const waiting = readSpecInProcess({ text: PETS }, { trusted: true }).then((json) => {
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
