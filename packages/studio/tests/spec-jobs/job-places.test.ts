/**
 * A job's place is its process's until the process has ended and its
 * memory is freed — not only until the job answered — however the job
 * ends: answered, failed, out of time, its caller gone, its process from
 * another build, or its job never given. The caller has its answer
 * meanwhile. A process that cannot be given its job fails it at once, and
 * one that ends on its own gives its place back as it ends.
 */
import type * as ChildProcesses from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VISITOR_READ } from "../../src/server/spec-jobs/job-budgets";
import { inJobPlace, TRUSTED_JOBS, VISITOR_JOBS } from "../../src/server/spec-jobs/job-places";
import { runInProcess } from "../../src/server/spec-jobs/run-in-process";
import { SPEC_JOB_PROTOCOL } from "../../src/server/spec-jobs/spec-job-protocol";
import { SpecWorkLimitError } from "../../src/server/spec-jobs/spec-work-limit-error";
import { StudioWorkerError } from "../../src/server/spec-jobs/studio-worker-error";
import { StudioBusyError } from "../../src/server/studio-busy-error";

/* A process that does nothing on its own: the test says what it sends, and when it has ended. */
const fake = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class FakeChild extends EventEmitter {
    static readonly started: FakeChild[] = [];
    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;
    killed = false;
    readonly stderr = null;
    /** What giving it a message fails with, as a channel already closed does. */
    sendFails: Error | null = null;
    constructor() {
      super();
      FakeChild.started.push(this);
    }
    send(_message: unknown, done?: (error: Error | null) => void): boolean {
      setImmediate(() => done?.(this.sendFails));
      return this.sendFails === null;
    }
    kill(): boolean {
      this.killed = true;
      return true;
    }
    /** The process has ended, as Node says once its memory is freed. */
    exit(code = 1): void {
      if (this.exitCode !== null) return;
      this.exitCode = code;
      this.emit("exit", code, null);
      this.emit("close", code, null);
    }
  }
  return { FakeChild };
});

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcesses>()),
  fork: () => new fake.FakeChild(),
}));

type FakeChild = InstanceType<typeof fake.FakeChild>;

const JOB = { kind: "spec:read", text: "{}", maxBytes: 1024 } as const;
const GREETING = { kind: "worker:ready", protocol: SPEC_JOB_PROTOCOL };
const REPLY = { kind: "spec:read", json: "{}" };

function children(): FakeChild[] {
  return fake.FakeChild.started;
}

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

/* A read for a caller with the token or without, in a place of its kind. */
function read(trusted: boolean, signal?: AbortSignal): Promise<unknown> {
  return inJobPlace(trusted, signal, () => runInProcess(JOB, VISITOR_READ, signal));
}

function answer(child: FakeChild | undefined): void {
  child?.emit("message", GREETING);
  child?.emit("message", REPLY);
}

/* Lets the promise callbacks that follow an event run. */
function settled(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  children().splice(0);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const child of children()) child.exit();
  await settled();
});

describe("a job's place", () => {
  /* How each job ends: through its process, or its caller's leaving. */
  const endings: Array<[string, (child: FakeChild, leave: () => void) => void]> = [
    ["answered", (child) => answer(child)],
    ["failed", (child) => child.emit("error", new Error("the process failed"))],
    ["its caller gone", (_child, leave) => leave()],
    [
      "its process from another build",
      (child) => child.emit("message", { ...GREETING, protocol: SPEC_JOB_PROTOCOL + 1 }),
    ],
    [
      "never given to its process",
      (child) => {
        child.sendFails = new Error("channel closed");
        child.emit("message", GREETING);
      },
    ],
  ];

  it.each(endings)("is held after the job %s, until its process has ended", async (_how, end) => {
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const jobs = callers.map((caller) => failureOf(read(false, caller.signal)));
    await settled();

    for (const [index, child] of children().entries()) {
      end(child, () => callers[index]?.abort(new Error("gone")));
    }
    await Promise.all(jobs);
    const whileEnding = await failureOf(read(false));
    for (const child of children()) child.exit();
    await settled();
    const before = children().length;
    void failureOf(read(false));
    await settled();

    expect(
      children()
        .slice(0, before)
        .every((child) => child.killed),
    ).toBe(true);
    expect(whileEnding).toBeInstanceOf(StudioBusyError);
    expect(children()).toHaveLength(before + 1);
  });

  it("is held after the job ran out of time, until its process has ended", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const jobs = Array.from({ length: VISITOR_JOBS }, () => failureOf(read(false)));
    await settled();
    for (const child of children()) child.emit("message", GREETING);

    await vi.advanceTimersByTimeAsync(VISITOR_READ.ms);
    const failures = await Promise.all(jobs);
    const whileEnding = await failureOf(read(false));
    for (const child of children()) child.exit();
    await settled();
    const again = failureOf(read(false));
    await settled();
    answer(children().at(-1));

    expect(failures.every((failure) => failure instanceof SpecWorkLimitError)).toBe(true);
    expect(whileEnding).toBeInstanceOf(StudioBusyError);
    expect(await again).toBeUndefined();
  });

  it("is given back as its process ends, when the process ends on its own", async () => {
    const jobs = Array.from({ length: VISITOR_JOBS }, () => failureOf(read(false)));
    await settled();

    for (const child of children()) {
      child.emit("message", GREETING);
      child.exit(3);
    }
    const failures = await Promise.all(jobs);
    await settled();
    const again = failureOf(read(false));
    await settled();
    answer(children().at(-1));

    expect(failures.every((failure) => failure instanceof StudioWorkerError)).toBe(true);
    expect(await again).toBeUndefined();
  });

  it("is given back at once when no process starts", async () => {
    const tooSmall = { ms: 1_000, heapMb: 2 };
    const refused: unknown[] = [];

    for (let attempt = 0; attempt <= VISITOR_JOBS; attempt++) {
      refused.push(
        await failureOf(inJobPlace(false, undefined, () => runInProcess(JOB, tooSmall))),
      );
    }

    expect(refused.every((failure) => failure instanceof RangeError)).toBe(true);
    expect(children()).toHaveLength(0);
  });

  it("has a caller with the token wait for a process to end, not only for its answer", async () => {
    const running = Array.from({ length: TRUSTED_JOBS }, () => read(true));
    await settled();
    for (const child of children()) answer(child);
    await Promise.all(running);
    let admitted = false;
    const waiting = read(true).then(() => {
      admitted = true;
    });
    await settled();
    const whileEnding = { admitted, processes: children().length };

    children()[0]?.exit();
    await settled();
    answer(children().at(-1));
    await waiting;

    expect(whileEnding).toEqual({ admitted: false, processes: TRUSTED_JOBS });
    expect(admitted).toBe(true);
    expect(children()).toHaveLength(TRUSTED_JOBS + 1);
  });
});

describe("a process that cannot be given its job", () => {
  it("fails the job at once as Studio's own failure, not as one over its budget", async () => {
    const reading = failureOf(read(false));
    await settled();
    const [child] = children();

    if (child) child.sendFails = new Error("channel closed");
    child?.emit("message", GREETING);
    const failure = await reading;

    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(failure).toMatchObject({ code: "STUDIO_WORKER_FAILED" });
    expect(String((failure as Error).message)).toContain("channel closed");
    expect(child?.killed).toBe(true);
  });
});
