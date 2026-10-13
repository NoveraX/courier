/**
 * Generating an import's code and comparing two specifications take a
 * second or more for a specification of several megabytes: for a caller
 * without the token they run in a thread of their own, as reading does —
 * the same result as in Studio's own thread, the same places, a budget,
 * and an end once the caller goes away.
 */
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";

import { diffSpecs, generateCode, type ParsedSpec } from "../../src/apis";
import { parseSpec } from "../../src/apis/parser/parse-spec";
import { diffInThread } from "../../src/server/spec-thread/diff-in-thread";
import { generateInThread } from "../../src/server/spec-thread/generate-in-thread";
import { readSpecInThread } from "../../src/server/spec-thread/read-spec-in-thread";
import { SpecWorkLimitError } from "../../src/server/spec-thread/spec-work-limit-error";
import { SpecWorkRefusedError } from "../../src/server/spec-thread/spec-work-refused-error";
import { VISITOR_JOBS } from "../../src/server/spec-thread/thread-places";
import { StudioBusyError } from "../../src/server/studio-busy-error";

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

function failureOf(running: Promise<unknown>): Promise<unknown> {
  return running.then(
    () => undefined,
    (error: unknown) => error,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateInThread", () => {
  it("generates the files generateCode does", async () => {
    const spec = sent(3);

    expect(await generateInThread(spec, OPTIONS, { trusted: false })).toEqual(
      generateCode(spec, OPTIONS),
    );
  });

  it("answers 400 with the generator's reason for options it refuses", async () => {
    const failure = await failureOf(
      generateInThread(sent(1), { ...OPTIONS, outputDir: "../outside" }, { trusted: false }),
    );

    expect(failure).toBeInstanceOf(SpecWorkRefusedError);
    expect(failure).toMatchObject({ httpStatus: 400, code: "CODE_NOT_GENERATED" });
    expect(String((failure as Error).message)).toContain("outputDir");
  });

  it("stops generating once it takes longer than its budget", async () => {
    const failure = await failureOf(
      generateInThread(sent(4_000), OPTIONS, {
        trusted: false,
        budget: { ms: 50, heapMb: 512 },
      }),
    );

    expect(failure).toBeInstanceOf(SpecWorkLimitError);
    expect(String((failure as Error).message)).toContain("generating code");
  });

  it("stops generating once its caller goes away, and ends its thread", async () => {
    const posted = vi.spyOn(Worker.prototype, "postMessage");
    const ended = vi.spyOn(Worker.prototype, "terminate");
    const caller = new AbortController();
    const running = failureOf(
      generateInThread(sent(4_000), OPTIONS, { trusted: false, signal: caller.signal }),
    );
    await vi.waitUntil(() => posted.mock.calls.length === 1);

    caller.abort(new Error("gone"));

    expect(await running).toMatchObject({ message: "gone" });
    const [thread] = ended.mock.contexts;
    await vi.waitUntil(() => thread instanceof Worker && thread.threadId === -1);
  });
});

describe("diffInThread", () => {
  it("compares as diffSpecs does", async () => {
    const before = sent(3);
    const after = sent(5);

    expect(await diffInThread(before, after, { trusted: false })).toEqual(diffSpecs(before, after));
  });
});

describe("the places callers without the token share", () => {
  it(`hold ${VISITOR_JOBS} jobs at once, of every kind: one more is refused as busy`, async () => {
    const callers = Array.from({ length: VISITOR_JOBS }, () => new AbortController());
    const running = callers.map((caller) =>
      failureOf(generateInThread(sent(4_000), OPTIONS, { trusted: false, signal: caller.signal })),
    );

    const read = await failureOf(readSpecInThread({ text: "{}" }, { trusted: false }));
    const diff = await failureOf(diffInThread(sent(1), sent(1), { trusted: false }));
    for (const caller of callers) caller.abort();
    await Promise.all(running);

    expect(read).toBeInstanceOf(StudioBusyError);
    expect(diff).toBeInstanceOf(StudioBusyError);
  });
});
