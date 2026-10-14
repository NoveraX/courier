/**
 * A process Studio starts for a job greets it first with the version of
 * what its script understands, and is given its job only then. A script
 * from another build of Studio — one built before the greeting, or one that
 * speaks another version — fails the job at once, saying how to fix it,
 * rather than leave it unanswered for its whole budget. A process that is
 * stopped however busy it is, or that fails however it fails, leaves Studio
 * running; one that takes more memory than it may, outside its heap too, is
 * stopped as over its budget; one whose Studio has gone ends too, however
 * busy.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FORMAT_WORKER_SCRIPT,
  JOB_MEMORY_CAP,
  JOB_MEMORY_WATCH_SCRIPT,
  startWorkerProcess,
} from "@noverax/courier-cli/devkit";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TRUSTED_JOB } from "../../src/server/spec-jobs/job-budgets";
import { runInProcess, WORKER_READY_MS } from "../../src/server/spec-jobs/run-in-process";
import { SPEC_JOB_PROTOCOL } from "../../src/server/spec-jobs/spec-job-protocol";
import { SpecWorkLimitError } from "../../src/server/spec-jobs/spec-work-limit-error";
import { StudioWorkerError } from "../../src/server/spec-jobs/studio-worker-error";

const script = vi.hoisted(() => ({ path: "", spec: "" }));

vi.mock("../../src/server/worker-scripts", async (importOriginal) => {
  const built = await importOriginal<{ SPEC_WORKER_SCRIPT: string }>();
  script.spec = built.SPEC_WORKER_SCRIPT;
  return {
    ...built,
    get SPEC_WORKER_SCRIPT() {
      return script.path;
    },
  };
});

let dir = "";

/* A worker script that listens as Studio's does, and does what `body` says. */
function workerScript(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `${body}\n`);
  return path;
}

const GREETING = `process.send({ kind: "worker:ready", protocol: ${SPEC_JOB_PROTOCOL} });`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-worker-scripts-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const JOB = { kind: "spec:read", text: "{}", maxBytes: 1024 } as const;

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("runInProcess with a worker script from another build of Studio", () => {
  it("fails at once when the script names another version of what Studio says to it", async () => {
    script.path = workerScript(
      "other-version.mjs",
      `process.send({ kind: "worker:ready", protocol: ${SPEC_JOB_PROTOCOL + 1} });\nprocess.on("message", () => {});`,
    );
    const started = Date.now();

    const failure = await failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(failure).toMatchObject({ code: "STUDIO_WORKER_OUTDATED" });
    expect(String((failure as Error).message)).toContain(
      `version ${SPEC_JOB_PROTOCOL + 1} of what Studio says to it, not ${SPEC_JOB_PROTOCOL}`,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it(`fails once ${WORKER_READY_MS / 1000} s pass without a greeting, not at the end of its budget`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = workerScript("silent.mjs", `process.on("message", () => {});`);
    const running = failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    await vi.advanceTimersByTimeAsync(WORKER_READY_MS);

    const failure = await running;
    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(failure).toMatchObject({ code: "STUDIO_WORKER_OUTDATED" });
    expect(String((failure as Error).message)).toContain("did not say it was ready");
  });

  it("fails at once, saying so and naming no path of this machine, when the script is missing", async () => {
    script.path = join(dir, "not-built.mjs");

    const failure = await failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(String((failure as Error).message)).toContain("worker script is missing");
    expect(String((failure as Error).message)).not.toContain(dir);
    expect(String((failure as Error & { cause?: Error }).cause?.message)).toContain(script.path);
  });

  it("takes no reply sent before the greeting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = workerScript(
      "answers-unasked.mjs",
      `process.send({ kind: "spec:read", json: "{}" });\nprocess.on("message", () => {});`,
    );
    const running = failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    await vi.advanceTimersByTimeAsync(WORKER_READY_MS);

    expect(await running).toMatchObject({ code: "STUDIO_WORKER_OUTDATED" });
  });
});

describe("runInProcess with this build's worker script", () => {
  it("gives the job once the script has greeted Studio, and answers", async () => {
    script.path = workerScript(
      "current.mjs",
      [
        GREETING,
        `process.on("message", (job) => process.send({ kind: job.kind, json: job.text }));`,
      ].join("\n"),
    );

    expect(await runInProcess(JOB, TRUSTED_JOB).reply).toEqual({ kind: "spec:read", json: "{}" });
  });

  it("answers though Studio's own thread was too busy to read its greeting in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = workerScript(
      "current-unread.mjs",
      [
        GREETING,
        `process.on("message", () => process.send({ kind: "spec:read", json: "{}" }));`,
      ].join("\n"),
    );
    const running = runInProcess(JOB, TRUSTED_JOB).reply;

    /* Busy while the script starts and greets, so that its greeting waits to be read. */
    const busyUntil = Date.now() + 1_000;
    while (Date.now() < busyUntil);
    vi.advanceTimersByTime(WORKER_READY_MS);

    expect(await running).toEqual({ kind: "spec:read", json: "{}" });
  });

  it("fails as Studio's own when the process ends before it answers", async () => {
    script.path = workerScript(
      "exits.mjs",
      [GREETING, `process.on("message", () => process.exit(3));`].join("\n"),
    );

    const failure = await failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(failure).toMatchObject({ code: "STUDIO_WORKER_FAILED" });
    expect(String((failure as Error).message)).toContain("code 3");
  });

  it("keeps the error a failed process reported, for Studio's log rather than its answer", async () => {
    script.path = workerScript(
      "throws.mjs",
      [
        GREETING,
        `process.on("message", () => setImmediate(() => { throw new TypeError("the job broke"); }));`,
      ].join("\n"),
    );

    const failure = await failureOf(runInProcess(JOB, TRUSTED_JOB).reply);

    expect(failure).toMatchObject({ code: "STUDIO_WORKER_FAILED" });
    expect(String((failure as Error).message)).not.toContain("the job broke");
    expect((failure as Error & { cause: Error }).cause.cause).toEqual(
      new Error("TypeError: the job broke"),
    );
  });

  it("fails the job of a process killed in the middle of it, and Studio goes on", async () => {
    script.path = workerScript(
      "killed.mjs",
      [GREETING, `process.on("message", () => process.kill(process.pid, "SIGKILL"));`].join("\n"),
    );

    const failure = await failureOf(runInProcess(JOB, TRUSTED_JOB).reply);
    script.path = workerScript(
      "after-killed.mjs",
      [
        GREETING,
        `process.on("message", () => process.send({ kind: "spec:read", json: "{}" }));`,
      ].join("\n"),
    );

    expect(failure).toBeInstanceOf(StudioWorkerError);
    expect(failure).toMatchObject({ code: "STUDIO_WORKER_FAILED" });
    expect(await runInProcess(JOB, TRUSTED_JOB).reply).toEqual({ kind: "spec:read", json: "{}" });
  });

  it("stops a process however busy it is, once its job has taken its time", async () => {
    script.path = workerScript(
      "busy.mjs",
      [GREETING, `process.on("message", () => { for (;;); });`].join("\n"),
    );
    const started = Date.now();
    const run = runInProcess(JOB, { ms: 300, heapMb: 64 });

    const failure = await failureOf(run.reply);
    await run.exited;

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("tells a process that ran out of its heap apart, as over its job's memory", async () => {
    script.path = workerScript(
      "hungry.mjs",
      [
        GREETING,
        `const kept = [];`,
        `process.on("message", () => { for (;;) kept.push(new Array(100_000).fill(kept.length)); });`,
      ].join("\n"),
    );

    const failure = await failureOf(runInProcess(JOB, { ms: 60_000, heapMb: 64 }).reply);

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain("64 MB");
  }, 30_000);

  it("tells it apart however long the native backtrace V8 follows its report with", async () => {
    script.path = workerScript(
      "hungry-deep.mjs",
      [
        `import { writeSync } from "node:fs";`,
        GREETING,
        `process.on("message", () => {`,
        `  writeSync(2, "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n");`,
        `  for (let frame = 1; frame <= 600; frame++) writeSync(2, \` \${frame}: 0x0 a native frame [/usr/local/bin/node]\\n\`);`,
        `  process.exit(134);`,
        `});`,
      ].join("\n"),
    );

    const failure = await failureOf(runInProcess(JOB, { ms: 60_000, heapMb: 64 }).reply);

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain("64 MB");
  });
  it("stops a process that takes more memory than it may, outside its heap too, however busy", async () => {
    script.path = workerScript(
      "hoards.mjs",
      [
        GREETING,
        `const kept = [];`,
        `process.on("message", () => { for (;;) kept.push(Buffer.alloc(8 * 1024 * 1024, 1)); });`,
      ].join("\n"),
    );
    const started = Date.now();

    const failure = await failureOf(
      runInProcess(JOB, { ms: 60_000, heapMb: 64, memoryMb: 192 }).reply,
    );

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain("192 MB");
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

/* Whether a process is still there. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("a worker process whose Studio has gone", () => {
  /* Its channel to Studio closes as Studio ends; Node reports its exit then,
     though not its close, which a channel closed from this side never gives. */
  it.each([
    ["reads, generates and compares specifications", () => script.spec],
    ["formats files", () => FORMAT_WORKER_SCRIPT],
  ])("ends, as one that %s", async (_does, built) => {
    const worker = startWorkerProcess(built(), []);
    await new Promise((resolve) => worker.child.once("spawn", resolve));
    const exited = new Promise<number | null>((resolve) =>
      worker.child.once("exit", (code) => resolve(code)),
    );

    worker.child.disconnect();

    expect(await exited).toBe(0);
  });
  it("ends however busy once Studio is gone, its memory watch seeing it go", async () => {
    const spins = workerScript(
      "spins.mjs",
      [GREETING, "setImmediate(() => { for (;;); });"].join("\n"),
    );
    const leaves = workerScript(
      "leaves.mjs",
      [
        `import { fork } from "node:child_process";`,
        `import { writeSync } from "node:fs";`,
        `const child = fork(${JSON.stringify(spins)}, [], {`,
        `  execArgv: [${JSON.stringify(`--import=${pathToFileURL(JOB_MEMORY_WATCH_SCRIPT).href}`)}],`,
        `  env: { ...process.env, ${JSON.stringify(JOB_MEMORY_CAP.env)}: "1024" },`,
        `  stdio: ["ignore", "ignore", "ignore", "ipc"],`,
        `});`,
        `child.once("message", () => { writeSync(1, String(child.pid)); process.exit(0); });`,
      ].join("\n"),
    );
    const studio = spawn(process.execPath, [leaves], { stdio: ["ignore", "pipe", "inherit"] });
    let said = "";
    studio.stdout.setEncoding("utf8");
    studio.stdout.on("data", (chunk: string) => {
      said += chunk;
    });
    await new Promise((resolve) => studio.once("exit", resolve));
    const pid = Number(said);

    try {
      await vi.waitUntil(() => !alive(pid), { timeout: 5_000, interval: 50 });
    } finally {
      if (pid > 0 && alive(pid)) process.kill(pid, "SIGKILL");
    }

    expect(pid).toBeGreaterThan(0);
    expect(alive(pid)).toBe(false);
  });
});
