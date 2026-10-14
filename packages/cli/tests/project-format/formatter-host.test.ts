/**
 * The processes Courier formats a project's files in: one that ends on its
 * own fails only the files it was given, saying why — the error it
 * reported, or that it ran out of memory however long V8's report of it —
 * and the next file is formatted in another. One whose tool takes over a
 * minute on a file is stopped; all are started again once the
 * configurations they read change, and end as Studio or the command that
 * started them stops.
 */
import type * as ChildProcesses from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeFormatProcesses, formatInProcess } from "../../src/project-format/formatter-host";
import type { Forked } from "../helpers/forked-processes";

const script = vi.hoisted(() => ({ path: "" }));
const forks = vi.hoisted((): Forked[] => []);

vi.mock("../../src/worker/worker-scripts", async (importOriginal) => {
  const built = await importOriginal<{ FORMAT_WORKER_SCRIPT: string }>();
  return {
    ...built,
    get FORMAT_WORKER_SCRIPT() {
      return script.path;
    },
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcesses>();
  const { recordingFork } = await import("../helpers/forked-processes");
  return { ...real, fork: recordingFork(real.fork, forks) };
});

let dir = "";
const root = "/project";

/* A format worker that answers as Courier's does: the text in capitals, unless the text says otherwise. */
const WORKER = `
import { writeSync } from "node:fs";
process.on("message", ({ id, text }) => {
  if (text === "hang") return;
  if (text === "crash") setImmediate(() => { throw new TypeError("the tool broke"); });
  else if (text === "out of memory") {
    writeSync(2, "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n");
    for (let frame = 1; frame <= 600; frame++) writeSync(2, \` \${frame}: 0x0 a native frame of V8's report [/usr/local/bin/node]\\n\`);
    process.exit(134);
  } else process.send({ id, text: text.toUpperCase() });
});
process.on("disconnect", () => process.exit(0));
`;

function format(text: string, stamp = "first"): Promise<string> {
  return formatInProcess(root, stamp, {
    tool: "Prettier",
    module: "prettier",
    root,
    path: "a.ts",
    text,
  });
}

function failureOf(formatting: Promise<unknown>): Promise<unknown> {
  return formatting.then(
    () => undefined,
    (error: unknown) => error,
  );
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-format-workers-"));
  script.path = join(dir, "format-worker.mjs");
  writeFileSync(script.path, WORKER);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  forks.splice(0);
});

afterEach(async () => {
  vi.useRealTimers();
  await closeFormatProcesses(root);
});

describe("a formatter process that ends on its own", () => {
  it("fails the file it was given with the error it reported, and the next is formatted in another", async () => {
    const failure = await failureOf(format("crash"));

    expect(String((failure as Error).message)).toBe(
      "its process ended with code 1: TypeError: the tool broke",
    );
    expect(await format("next")).toBe("NEXT");
    expect(forks).toHaveLength(2);
  });

  it("says it ran out of memory, however long V8's report of it", async () => {
    const failure = await failureOf(format("out of memory"));

    expect(String((failure as Error).message)).toBe("its process ran out of memory");
    expect(await format("next")).toBe("NEXT");
  });
});

describe("a formatter process whose tool takes over a minute on a file", () => {
  it("is stopped, failing that file, and the next is formatted in another", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hanging = failureOf(format("hang"));
    await vi.waitUntil(() => forks[0]?.sent.length === 1, { timeout: 10_000 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(String(((await hanging) as Error).message)).toBe("it took longer than 60 s");
    await vi.waitUntil(() => forks[0]?.closed, { timeout: 10_000 });
    vi.useRealTimers();
    expect(await format("next")).toBe("NEXT");
  });
});

describe("the formatter processes of a project", () => {
  it("are started again once the configurations they read change", async () => {
    expect(await format("before", "first")).toBe("BEFORE");

    expect(await format("after", "second")).toBe("AFTER");

    await vi.waitUntil(() => forks[0]?.closed, { timeout: 10_000 });
    expect(forks).toHaveLength(2);
  });

  it("end as Studio or the command that started them stops", async () => {
    await Promise.all([format("one"), format("two")]);

    await closeFormatProcesses(root);

    expect(forks.length).toBeGreaterThan(0);
    expect(forks.every((fork) => fork.closed)).toBe(true);
  });
});
