/**
 * A thread Studio starts for a job greets it first with the version of
 * what its script understands. A script from another build of Studio —
 * one built before the greeting, which never answers a job, or one that
 * speaks another version — fails the job at once, saying how to fix it,
 * rather than leave it unanswered for its whole budget.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runInThread, THREAD_READY_MS } from "../../src/server/spec-thread/run-in-thread";
import { SPEC_THREAD_PROTOCOL } from "../../src/server/spec-thread/spec-thread-protocol";
import { StudioThreadError } from "../../src/server/spec-thread/studio-thread-error";
import { TRUSTED_JOB } from "../../src/server/spec-thread/thread-budgets";

const script = vi.hoisted(() => ({ path: "" }));

vi.mock("../../src/server/studio-thread-script", () => ({
  get STUDIO_THREAD_SCRIPT() {
    return script.path;
  },
}));

let dir = "";

/* A thread script that listens as Studio's does, and does what `body` says with each message. */
function threadScript(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `import { parentPort } from "node:worker_threads";\n${body}\n`);
  return path;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-thread-scripts-"));
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

describe("runInThread with a thread script from another build of Studio", () => {
  it("fails at once when the script names another version of what Studio says to it", async () => {
    script.path = threadScript(
      "other-version.mjs",
      `parentPort.postMessage({ kind: "thread:ready", protocol: ${SPEC_THREAD_PROTOCOL + 1} });`,
    );
    const started = Date.now();

    const failure = await failureOf(runInThread(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioThreadError);
    expect(failure).toMatchObject({ code: "STUDIO_THREAD_OUTDATED" });
    expect(String((failure as Error).message)).toContain(
      `version ${SPEC_THREAD_PROTOCOL + 1} of what Studio says to it, not ${SPEC_THREAD_PROTOCOL}`,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it(`fails once ${THREAD_READY_MS / 1000} s pass without a greeting, not at the end of its budget`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = threadScript("silent.mjs", `parentPort.on("message", () => {});`);
    const running = failureOf(runInThread(JOB, TRUSTED_JOB).reply);

    await vi.advanceTimersByTimeAsync(THREAD_READY_MS);

    const failure = await running;
    expect(failure).toBeInstanceOf(StudioThreadError);
    expect(failure).toMatchObject({ code: "STUDIO_THREAD_OUTDATED" });
    expect(String((failure as Error).message)).toContain("did not say it was ready");
  });

  it("fails at once, saying so, when the script is missing", async () => {
    script.path = join(dir, "not-built.mjs");

    const failure = await failureOf(runInThread(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioThreadError);
    expect(String((failure as Error).message)).toContain("thread script is missing");
  });

  it("takes no reply sent before the greeting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = threadScript(
      "answers-unasked.mjs",
      `parentPort.on("message", () => parentPort.postMessage({ kind: "spec:read", json: "{}" }));`,
    );
    const running = failureOf(runInThread(JOB, TRUSTED_JOB).reply);

    await vi.advanceTimersByTimeAsync(THREAD_READY_MS);

    expect(await running).toMatchObject({ code: "STUDIO_THREAD_OUTDATED" });
  });
});

describe("runInThread with this build's thread script", () => {
  it("answers once the script has greeted Studio", async () => {
    script.path = threadScript(
      "current.mjs",
      [
        `parentPort.postMessage({ kind: "thread:ready", protocol: ${SPEC_THREAD_PROTOCOL} });`,
        `parentPort.on("message", () => parentPort.postMessage({ kind: "spec:read", json: "{}" }));`,
      ].join("\n"),
    );

    expect(await runInThread(JOB, TRUSTED_JOB).reply).toEqual({ kind: "spec:read", json: "{}" });
  });

  it("answers though Studio's own thread was too busy to read its greeting in time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    script.path = threadScript(
      "current-unread.mjs",
      [
        `parentPort.postMessage({ kind: "thread:ready", protocol: ${SPEC_THREAD_PROTOCOL} });`,
        `parentPort.on("message", () => parentPort.postMessage({ kind: "spec:read", json: "{}" }));`,
      ].join("\n"),
    );
    const running = runInThread(JOB, TRUSTED_JOB).reply;

    /* Busy while the script starts and greets, so that its greeting waits to be read. */
    const busyUntil = Date.now() + 1_000;
    while (Date.now() < busyUntil);
    vi.advanceTimersByTime(THREAD_READY_MS);

    expect(await running).toEqual({ kind: "spec:read", json: "{}" });
  });

  it("fails as Studio's own when the thread ends before it answers", async () => {
    script.path = threadScript(
      "exits.mjs",
      [
        `parentPort.postMessage({ kind: "thread:ready", protocol: ${SPEC_THREAD_PROTOCOL} });`,
        `parentPort.on("message", () => process.exit(3));`,
      ].join("\n"),
    );

    const failure = await failureOf(runInThread(JOB, TRUSTED_JOB).reply);

    expect(failure).toBeInstanceOf(StudioThreadError);
    expect(failure).toMatchObject({ code: "STUDIO_THREAD_FAILED" });
    expect(String((failure as Error).message)).toContain("code 3");
  });
});
