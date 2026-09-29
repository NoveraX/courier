/**
 * What Courier's terminal logger prints, and where.
 *
 * Warnings and errors go to stderr and the rest to stdout, through the
 * console, so a cause prints with its stack and `cause` chain — and the root
 * of a chain too deep for the console to show is printed on its own. A `%`
 * in a message stays literal. Colour follows the terminal, NO_COLOR and
 * FORCE_COLOR. COURIER_LOG_LEVEL sets the lowest level printed, `info` by
 * default.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger, logger } from "../src/logger";

const ESC = "\x1b[";
const LEVELS = ["debug", "info", "warn", "error"] as const;
const spies = {} as Record<(typeof LEVELS)[number], ReturnType<typeof vi.spyOn>>;

function printed(level: (typeof LEVELS)[number]): unknown[][] {
  return spies[level].mock.calls;
}

/** The first console call at `level`, which must have happened. */
function firstCall(level: (typeof LEVELS)[number]): unknown[] {
  const [call] = printed(level);
  if (!call) throw new Error(`console.${level} was not called`);
  return call;
}

function setTty(stream: NodeJS.WriteStream, isTTY: boolean, depth = 24): () => void {
  const had = { isTTY: stream.isTTY, getColorDepth: stream.getColorDepth };
  Object.defineProperty(stream, "isTTY", { value: isTTY, configurable: true });
  Object.defineProperty(stream, "getColorDepth", { value: () => depth, configurable: true });
  return () => {
    Object.defineProperty(stream, "isTTY", { value: had.isTTY, configurable: true });
    Object.defineProperty(stream, "getColorDepth", {
      value: had.getColorDepth,
      configurable: true,
    });
  };
}

beforeEach(() => {
  for (const level of LEVELS) spies[level] = vi.spyOn(console, level).mockImplementation(() => {});
  vi.stubEnv("COURIER_LOG_LEVEL", undefined);
  vi.stubEnv("FORCE_COLOR", undefined);
  vi.stubEnv("NO_COLOR", undefined);
  vi.stubEnv("TERM", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("where a line goes", () => {
  it("sends each level to the console method of the same name, never to stdout directly", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const write = vi.spyOn(process.stdout, "write");
    const log = createLogger("Test");

    for (const level of LEVELS) log[level](`a ${level} line`);

    for (const level of LEVELS) expect(String(firstCall(level)[1])).toContain(`a ${level} line`);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes warnings and errors to stderr and the rest to stdout, in a real process", () => {
    const dir = mkdtempSync(join(tmpdir(), "courier-logger-"));
    const script = join(dir, "log.mts");
    const source = join(__dirname, "../src/logger/index.ts").replaceAll("\\", "/");
    writeFileSync(
      script,
      `import { createLogger } from "${source}";\n` +
        'const log = createLogger("Probe");\nlog.info("to stdout");\nlog.warn("to stderr");\nlog.error("also stderr");\n',
    );
    const tsx = createRequire(import.meta.url).resolve("tsx");

    const run = spawnSync(process.execPath, ["--import", tsx, script], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", COURIER_LOG_LEVEL: "" },
    });
    rmSync(dir, { recursive: true, force: true });

    expect(run.stdout).toContain("to stdout");
    expect(run.stdout).not.toContain("stderr");
    expect(run.stderr).toContain("to stderr");
    expect(run.stderr).toContain("also stderr");
  });
});

describe("the cause", () => {
  it("is handed to the console as it is, so its stack and cause chain print", () => {
    const cause = new Error("redis subscribe failed", {
      cause: new Error("ECONNREFUSED 127.0.0.1:6379"),
    });

    createLogger("WS").warn("onJoin handler failed", cause);

    expect(firstCall("warn")).toContain(cause);
  });

  it("is kept by the global logger", () => {
    const cause = new Error("boom");

    logger.error("Global", "it failed", cause);

    expect(firstCall("error")).toContain(cause);
  });

  it("brings up the root of a chain too deep for the console to show", () => {
    const root = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:59999"), {
      code: "ECONNREFUSED",
    });
    const top = new Error("request failed", {
      cause: new Error("upstream", { cause: new TypeError("fetch failed", { cause: root }) }),
    });

    createLogger("Proxy").warn("Upstream request failed", top);

    expect(firstCall("warn")).toContain(top);
    expect(firstCall("warn")).toContain(root);
  });

  it("brings up an AggregateError whose errors the console would hide", () => {
    const refused = new AggregateError(
      [Object.assign(new Error("connect ECONNREFUSED ::1:59999"), { port: 59999 })],
      "",
    );
    const fetchFailed = new TypeError("fetch failed", { cause: refused });

    createLogger("Proxy").warn("Upstream request failed", fetchFailed);

    expect(firstCall("warn")).toContain(refused);
  });

  it("adds nothing when the console shows the whole chain", () => {
    const top = new Error("upstream", {
      cause: new TypeError("fetch failed", { cause: new Error("refused") }),
    });

    createLogger("Proxy").warn("Upstream request failed", top);

    expect(firstCall("warn")).toHaveLength(3);
  });

  it("brings up the root exactly when the console hides it", () => {
    const keyed = (message: string) =>
      Object.assign(new Error(message), { code: "ECONNREFUSED", port: 4000 });
    const chain = (depth: number, root: Error): Error => {
      let error = root;
      for (let level = depth; level > 0; level--)
        error = new Error(`level ${level}`, { cause: error });
      return error;
    };
    const cases = [
      chain(2, keyed("ROOT")),
      chain(3, keyed("ROOT")),
      chain(3, new Error("ROOT")),
      chain(4, new Error("ROOT")),
      chain(5, keyed("ROOT")),
      new AggregateError([keyed("ROOT")], ""),
      chain(1, new AggregateError([keyed("ROOT")], "")),
      chain(1, new AggregateError([new Error("ROOT")], "")),
      chain(2, new AggregateError([new Error("ROOT")], "")),
    ];

    for (const top of cases) {
      spies.warn.mockClear();
      createLogger("Chain").warn("failed", top);
      const shownByConsole = inspect(top).includes("ROOT");
      expect(firstCall("warn").length > 3, inspect(top)).toBe(!shownByConsole);
    }
  });

  it("adds no root for a null or primitive cause, or a chain that loops", () => {
    const withNull = new Error("a", {
      cause: new Error("b", { cause: new Error("c", { cause: null }) }),
    });
    const withString = new Error("a", {
      cause: new Error("b", { cause: new Error("c", { cause: "ECONNRESET" }) }),
    });
    const first = new Error("first");
    const second = new Error("second", { cause: new Error("third", { cause: first }) });
    Object.defineProperty(first, "cause", { value: second });

    for (const cause of [withNull, withString, first]) {
      spies.warn.mockClear();
      createLogger("Chain").warn("failed", cause);
      expect(firstCall("warn")).toHaveLength(3);
    }
  });
});

describe("the message", () => {
  it("keeps a percent sign literal: it is an argument, not the format", () => {
    const cause = new SyntaxError("Unexpected token");

    createLogger("SSE").warn('bad data {"pct": 100%c %s}', cause);

    const [format, line, ...rest] = firstCall("warn");
    expect(format).toBe("%s");
    expect(String(line)).toContain('{"pct": 100%c %s}');
    expect(rest).toEqual([cause]);
  });
});

describe("colour", () => {
  it("is off when NO_COLOR is set, even on a terminal", () => {
    vi.stubEnv("NO_COLOR", "1");
    const restore = setTty(process.stderr, true);

    createLogger("Test").warn("plain");
    restore();

    expect(String(firstCall("warn")[1])).not.toContain(ESC);
  });

  it("is off when the stream is not a terminal", () => {
    const restore = setTty(process.stdout, false);

    createLogger("Test").info("plain");
    restore();

    expect(String(firstCall("info")[1])).not.toContain(ESC);
  });

  it("is on when FORCE_COLOR=1, even into a pipe", () => {
    vi.stubEnv("FORCE_COLOR", "1");
    const restore = setTty(process.stdout, false);

    createLogger("Test").info("coloured");
    restore();

    expect(String(firstCall("info")[1])).toContain(ESC);
  });

  it("is on for a terminal that shows colour", () => {
    const restore = setTty(process.stderr, true, 24);

    createLogger("Test").error("coloured");
    restore();

    expect(String(firstCall("error")[1])).toContain(ESC);
  });
});

describe("COURIER_LOG_LEVEL", () => {
  it("drops debug lines by default", () => {
    createLogger("Test").debug("hidden");
    createLogger("Test").info("shown");

    expect(printed("debug")).toHaveLength(0);
    expect(printed("info")).toHaveLength(1);
  });

  it("warn drops info", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "warn");

    createLogger("Test").info("hidden");
    createLogger("Test").warn("shown");

    expect(printed("info")).toHaveLength(0);
    expect(printed("warn")).toHaveLength(1);
  });

  it("silent drops everything", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "silent");

    for (const level of LEVELS) createLogger("Test")[level]("hidden");

    for (const level of LEVELS) expect(printed(level)).toHaveLength(0);
  });

  it("accepts a level in upper case", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "ERROR");

    createLogger("Test").warn("hidden");
    createLogger("Test").error("shown");

    expect(printed("warn")).toHaveLength(0);
    expect(printed("error")).toHaveLength(1);
  });

  it("reports a value it does not know once, and keeps info", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "verbose-unknown");

    createLogger("Test").info("first");
    createLogger("Test").info("second");

    const reports = printed("warn").filter((call) => String(call[1]).includes("verbose-unknown"));
    expect(reports).toHaveLength(1);
    expect(printed("info")).toHaveLength(2);
  });
});

describe("the prefix", () => {
  it("leaves out the process id where there is no process", () => {
    const pid = Object.getOwnPropertyDescriptor(process, "pid");
    Object.defineProperty(process, "pid", { value: undefined, configurable: true });

    createLogger("Worker").info("no pid");
    if (pid) Object.defineProperty(process, "pid", pid);

    expect(String(firstCall("info")[1])).not.toContain("undefined");
  });
});
