/**
 * Generating an import's code and comparing two specifications take a
 * second or more for a specification of several megabytes: for a caller
 * without the token they run in a process of their own, as reading does —
 * the same result as in Studio's own process, the same places, a budget,
 * and an end once the caller goes away.
 */
import type * as ChildProcesses from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diffSpecs, generateCode, type ParsedSchema, type ParsedSpec } from "../../src/apis";
import { parseSpec } from "../../src/apis/parser/parse-spec";
import { diffInProcess } from "../../src/server/spec-jobs/diff-in-process";
import { generateInProcess } from "../../src/server/spec-jobs/generate-in-process";
import { VISITOR_JOBS } from "../../src/server/spec-jobs/job-places";
import { readSpecInProcess } from "../../src/server/spec-jobs/read-spec-in-process";
import { SpecWorkLimitError } from "../../src/server/spec-jobs/spec-work-limit-error";
import { SpecWorkRefusedError } from "../../src/server/spec-jobs/spec-work-refused-error";
import { StudioBusyError } from "../../src/server/studio-busy-error";
import type { Forked } from "../helpers/forked-processes";

const forks = vi.hoisted((): Forked[] => []);

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcesses>();
  const { recordingFork } = await import("../helpers/forked-processes");
  return { ...real, fork: recordingFork(real.fork, forks) };
});

const OPTIONS = {
  type: "openapi",
  outputDir: "src/api",
  sourceName: "pets",
  selectedEndpoints: null,
} as const;

/* A specification as the page sends it back: parsed, then through JSON. */
function sent(paths: number): ParsedSpec {
  const document = {
    openapi: "3.1.0",
    info: { title: "Pets", version: "1" },
    paths: Object.fromEntries(
      Array.from({ length: paths }, (_, n) => [
        `/pets${n}/{id}`,
        {
          get: {
            operationId: `getPet${n}`,
            tags: [`group${n % 7}`],
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "ok" } },
          },
        },
      ]),
    ),
  };
  return JSON.parse(JSON.stringify(parseSpec(JSON.stringify(document)))) as ParsedSpec;
}

/* A schema nested as deep as JSON parses, and deeper than Node copies from one process to another. */
function nested(depth: number): ParsedSpec {
  let schema: ParsedSchema = { name: "Deep", type: "string" };
  for (let level = 0; level < depth; level++) {
    schema = { name: "Deep", type: "array", items: schema };
  }
  return { ...sent(1), schemas: { Deep: schema } };
}

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

beforeEach(() => {
  forks.splice(0);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await vi.waitUntil(() => forks.every((fork) => fork.closed), { timeout: 10_000 });
});

describe("generateInProcess", () => {
  it("generates the files generateCode does", async () => {
    const spec = sent(3);

    expect(await generateInProcess(spec, OPTIONS, { trusted: false })).toEqual(
      generateCode(spec, OPTIONS),
    );
  });

  it("answers 400 with the generator's reason for options it refuses", async () => {
    const failure = await failureOf(
      generateInProcess(sent(1), { ...OPTIONS, outputDir: "../outside" }, { trusted: false }),
    );

    expect(failure).toBeInstanceOf(SpecWorkRefusedError);
    expect(failure).toMatchObject({ httpStatus: 400, code: "CODE_NOT_GENERATED" });
    expect(String((failure as Error).message)).toContain("outputDir");
  });

  it("stops generating once it takes longer than its budget", async () => {
    /* Its time is counted from when the process is given the job, which
       takes tens of milliseconds to read the specification alone. */
    const failure = await failureOf(
      generateInProcess(sent(4_000), OPTIONS, {
        trusted: false,
        budget: { ms: 1, heapMb: 512 },
      }),
    );

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain("generating code");
  });

  it("stops generating once its caller goes away, and its process", async () => {
    const caller = new AbortController();
    /* The code of 40,000 operations: hundreds of milliseconds of generating. */
    const running = failureOf(
      generateInProcess(sent(40_000), OPTIONS, { trusted: false, signal: caller.signal }),
    );
    await vi.waitUntil(() => forks[0]?.sent.length === 1, { timeout: 10_000, interval: 1 });

    caller.abort(new Error("gone"));

    expect(await running).toMatchObject({ message: "gone" });
    await vi.waitUntil(() => forks.length === 1 && forks[0]?.closed);
  });
});

describe("diffInProcess", () => {
  it("compares as diffSpecs does", async () => {
    const before = sent(3);
    const after = sent(5);

    expect(await diffInProcess(before, after, { trusted: false })).toEqual(
      diffSpecs(before, after),
    );
  });
});

describe("the places callers without the token share", () => {
  it(`hold ${VISITOR_JOBS} jobs at once, of every kind: one more is refused as busy`, async () => {
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const running = callers.map((caller) =>
      failureOf(generateInProcess(sent(4_000), OPTIONS, { trusted: false, signal: caller.signal })),
    );

    const read = await failureOf(readSpecInProcess({ text: "{}" }, { trusted: false }));
    const diff = await failureOf(diffInProcess(sent(1), sent(1), { trusted: false }));
    for (const caller of callers) caller.abort();
    await Promise.all(running);

    expect(read).toBeInstanceOf(StudioBusyError);
    expect(diff).toBeInstanceOf(StudioBusyError);
  });
});

describe("a specification nested deeper than Node hands to a process", () => {
  it("is refused as more than Studio works on, and Studio goes on", async () => {
    const generating = await failureOf(
      generateInProcess(nested(20_000), OPTIONS, { trusted: false }),
    );
    const comparing = await failureOf(diffInProcess(nested(20_000), sent(1), { trusted: false }));

    expect(generating).toBeInstanceOf(SpecWorkLimitError);
    expect(generating).toMatchObject({ httpStatus: 413, code: "SPEC_WORK_LIMIT" });
    expect(String((generating as Error).message)).toContain("nested too deeply");
    expect(comparing).toBeInstanceOf(SpecWorkLimitError);
    expect(await generateInProcess(sent(1), OPTIONS, { trusted: false })).toEqual(
      generateCode(sent(1), OPTIONS),
    );
  });
});
