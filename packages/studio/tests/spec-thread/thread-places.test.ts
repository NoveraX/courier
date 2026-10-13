/**
 * A job's place is the thread's until the thread has exited and its heap is
 * freed — not only until the job answered — however the job ends: answered,
 * failed, out of time, its caller gone, or its thread from another build.
 * The caller has its answer meanwhile. A thread whose reply Studio cannot
 * read fails its job at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInThread } from "../../src/server/spec-thread/run-in-thread";
import { SPEC_THREAD_PROTOCOL } from "../../src/server/spec-thread/spec-thread-protocol";
import { SpecWorkLimitError } from "../../src/server/spec-thread/spec-work-limit-error";
import { StudioThreadError } from "../../src/server/spec-thread/studio-thread-error";
import { VISITOR_READ } from "../../src/server/spec-thread/thread-budgets";
import {
  inThreadPlace,
  TRUSTED_JOBS,
  VISITOR_JOBS,
} from "../../src/server/spec-thread/thread-places";
import { StudioBusyError } from "../../src/server/studio-busy-error";

/* A thread that does nothing on its own: the test says what it posts, and when it has exited. */
const fake = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class FakeWorker extends EventEmitter {
    static readonly started: FakeWorker[] = [];
    threadId = 1;
    terminated = false;
    private gone: (code: number) => void = () => undefined;
    constructor() {
      super();
      FakeWorker.started.push(this);
    }
    postMessage(): void {}
    terminate(): Promise<number> {
      this.terminated = true;
      return new Promise((resolve) => {
        this.gone = resolve;
      });
    }
    /** The thread is gone, as Node says once its heap is freed. */
    exit(code = 1): void {
      if (this.threadId === -1) return;
      this.threadId = -1;
      this.emit("exit", code);
      this.gone(code);
    }
  }
  return { FakeWorker };
});

vi.mock("node:worker_threads", () => ({ Worker: fake.FakeWorker }));

type FakeWorker = InstanceType<typeof fake.FakeWorker>;

const JOB = { kind: "spec:read", text: "{}", maxBytes: 1024 } as const;
const GREETING = { kind: "thread:ready", protocol: SPEC_THREAD_PROTOCOL };
const REPLY = { kind: "spec:read", json: "{}" };

function workers(): FakeWorker[] {
  return fake.FakeWorker.started;
}

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/* A read for a caller with the token or without, in a place of its kind. */
function read(trusted: boolean, signal?: AbortSignal): Promise<unknown> {
  return inThreadPlace(trusted, signal, () => runInThread(JOB, VISITOR_READ, signal));
}

function answer(worker: FakeWorker | undefined): void {
  worker?.emit("message", GREETING);
  worker?.emit("message", REPLY);
}

/* Lets the promise callbacks that follow an event run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  workers().splice(0);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const worker of workers()) worker.exit();
  await settled();
});

describe("a job's place", () => {
  /* How each job ends: through its thread, or its caller's leaving. */
  const endings: Array<[string, (worker: FakeWorker, leave: () => void) => void]> = [
    ["answered", (worker) => answer(worker)],
    ["failed", (worker) => worker.emit("error", new Error("the thread threw"))],
    ["its caller gone", (_worker, leave) => leave()],
    [
      "its thread from another build",
      (worker) => worker.emit("message", { ...GREETING, protocol: SPEC_THREAD_PROTOCOL + 1 }),
    ],
    [
      "its reply unreadable",
      (worker) => {
        worker.emit("message", GREETING);
        worker.emit("messageerror", new Error("could not be deserialized"));
      },
    ],
  ];

  it.each(endings)("is held after the job %s, until its thread has exited", async (_how, end) => {
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const jobs = callers.map((caller) => failureOf(read(false, caller.signal)));
    await settled();

    for (const [index, worker] of workers().entries()) {
      end(worker, () => callers[index]?.abort(new Error("gone")));
    }
    await Promise.all(jobs);
    const whileExiting = await failureOf(read(false));
    for (const worker of workers()) worker.exit();
    await settled();
    const before = workers().length;
    void failureOf(read(false));
    await settled();

    expect(
      workers()
        .slice(0, before)
        .every((worker) => worker.terminated),
    ).toBe(true);
    expect(whileExiting).toBeInstanceOf(StudioBusyError);
    expect(workers()).toHaveLength(before + 1);
  });

  it("is held after the job ran out of time, until its thread has exited", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const jobs = Array.from({ length: VISITOR_JOBS }, () => failureOf(read(false)));
    await settled();
    for (const worker of workers()) worker.emit("message", GREETING);

    await vi.advanceTimersByTimeAsync(VISITOR_READ.ms);
    const failures = await Promise.all(jobs);
    const whileExiting = await failureOf(read(false));
    for (const worker of workers()) worker.exit();
    await settled();
    const again = failureOf(read(false));
    await settled();
    answer(workers().at(-1));

    expect(failures.every((failure) => failure instanceof SpecWorkLimitError)).toBe(true);
    expect(whileExiting).toBeInstanceOf(StudioBusyError);
    expect(await again).toBeUndefined();
  });

  it("is given back at once when no thread starts", async () => {
    const tooSmall = { ms: 1_000, heapMb: 2 };
    const refused: unknown[] = [];

    for (let attempt = 0; attempt <= VISITOR_JOBS; attempt++) {
      refused.push(
        await failureOf(inThreadPlace(false, undefined, () => runInThread(JOB, tooSmall))),
      );
    }

    expect(refused.every((failure) => failure instanceof RangeError)).toBe(true);
    expect(workers()).toHaveLength(0);
  });

  it("has a caller with the token wait for a thread to exit, not only for its answer", async () => {
    const running = Array.from({ length: TRUSTED_JOBS }, () => read(true));
    await settled();
    for (const worker of workers()) answer(worker);
    await Promise.all(running);
    let admitted = false;
    const waiting = read(true).then(() => {
      admitted = true;
    });
    await settled();
    const whileExiting = { admitted, threads: workers().length };

    workers()[0]?.exit();
    await settled();
    answer(workers().at(-1));
    await waiting;

    expect(whileExiting).toEqual({ admitted: false, threads: TRUSTED_JOBS });
    expect(admitted).toBe(true);
    expect(workers()).toHaveLength(TRUSTED_JOBS + 1);
  });
});

describe("a thread whose reply Studio cannot read", () => {
  it("fails its job at once as the thread's own failure, not as one over its budget", async () => {
    const reading = failureOf(read(false));
    await settled();
    const [worker] = workers();

    worker?.emit("message", GREETING);
    worker?.emit("messageerror", new Error("could not be deserialized"));
    const failure = await reading;

    expect(failure).toBeInstanceOf(StudioThreadError);
    expect(failure).toMatchObject({ code: "STUDIO_THREAD_FAILED" });
    expect(String((failure as Error).message)).toContain("could not be deserialized");
    expect(worker?.terminated).toBe(true);
  });
});
