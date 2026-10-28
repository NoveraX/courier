/**
 * @vitest-environment node
 *
 * The engine a bundler plugin reads a project's routes through: read once,
 * then again only when a file the reading read, or a variable it looked at,
 * has changed. Readings asked for together share one, and a failure is not
 * kept: the next read tries again.
 */
import { mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutesEngine, type RoutesEvaluator } from "../../src/engine/routes-engine";
import { RoutesReadError } from "../../src/engine/routes-read-error";
import type { RoutesRequest, RoutesSnapshot } from "../../src/engine/routes-snapshot";

let dir: string;
let config: string;
let api: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-routes-engine-")));
  config = join(dir, "courier.config.ts");
  api = join(dir, "api.ts");
  writeFileSync(config, "export default { sources: {} };\n");
  writeFileSync(api, "export const api = {};\n");
  /* Saved a while ago, as a project's files are when a build reads them: one saved in the
     millisecond a reading begins may have been read before or after, and is read again. */
  const earlier = new Date(Date.now() - 60_000);
  for (const file of [config, api]) utimesSync(file, earlier, earlier);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

/* An evaluator that reads nothing itself: it answers with the files and variables a reading would name. */
function evaluator(
  files: () => string[] = () => [config, api],
  during: () => void = () => {},
): { evaluate: RoutesEvaluator; requests: RoutesRequest[] } {
  const requests: RoutesRequest[] = [];
  const evaluate = async (request: RoutesRequest): Promise<RoutesSnapshot> => {
    requests.push(request);
    during();
    return {
      configFile: config,
      routes: { shop: { source: "shop", endpoints: {} } },
      files: files(),
      env: ["SHOP_PUBLIC"],
    };
  };
  return { evaluate, requests };
}

/* An evaluator whose readings wait to be let go, each answering with its own number as the source's name. */
function heldEvaluator(): {
  evaluate: RoutesEvaluator;
  started: () => number;
  release: (outcome?: Error) => void;
} {
  const held: Array<(outcome?: Error) => void> = [];
  const evaluate = (): Promise<RoutesSnapshot> => {
    const reading = held.length + 1;
    return new Promise((resolve, reject) => {
      held.push((outcome) => {
        if (outcome === undefined) resolve(numbered(reading));
        else reject(outcome);
      });
    });
  };
  return {
    evaluate,
    started: () => held.length,
    release: (outcome) => held.at(-1)?.(outcome),
  };
}

function numbered(reading: number): RoutesSnapshot {
  return {
    configFile: config,
    routes: { [`reading${reading}`]: { source: `reading${reading}`, endpoints: {} } },
    files: [config, api],
    env: [],
  };
}

/* Until the readings begun so far reach a number: a reading begins on a later turn of the loop. */
async function begun(started: () => number, count: number): Promise<void> {
  await vi.waitFor(() => expect(started()).toBe(count));
}

describe("createRoutesEngine", () => {
  it("reads the routes once, and gives them again while nothing they depend on changes", async () => {
    const { evaluate, requests } = evaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);

    const first = await engine.read();
    const second = await engine.read();

    expect(second).toBe(first);
    expect(requests).toHaveLength(1);
  });

  it("reads them again once a file the reading read has changed", async () => {
    const { evaluate, requests } = evaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    await engine.read();

    writeFileSync(api, "export const api = { shop: true };\n");
    await engine.read();

    expect(requests).toHaveLength(2);
  });

  it("reads them again once a file the reading looked for has appeared", async () => {
    const local = join(dir, ".env.local");
    const { evaluate, requests } = evaluator(() => [config, local]);
    const engine = createRoutesEngine({ root: dir }, evaluate);
    await engine.read();

    writeFileSync(local, "SHOP_PUBLIC=1\n");
    await engine.read();

    expect(requests).toHaveLength(2);
  });

  it("reads them again once a variable the reading looked at has changed", async () => {
    const { evaluate, requests } = evaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    await engine.read();

    vi.stubEnv("SHOP_PUBLIC", "1");
    await engine.read();

    expect(requests).toHaveLength(2);
  });

  it("reads them again after a file changed while the reading ran, which it may have read either way", async () => {
    const { evaluate, requests } = evaluator(undefined, () => {
      writeFileSync(api, `export const api = ${Date.now()};\n`);
    });
    const engine = createRoutesEngine({ root: dir }, evaluate);
    await engine.read();

    await engine.read();

    expect(requests).toHaveLength(2);
  });

  it("shares one reading between the calls made while it runs", async () => {
    const { evaluate, requests } = evaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);

    const [first, second] = await Promise.all([engine.read(), engine.read()]);

    expect(second).toBe(first);
    expect(requests).toHaveLength(1);
  });

  it("hands a call made while a reading ran the next reading, when a file changed meanwhile", async () => {
    const { evaluate, started, release } = heldEvaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    const first = engine.read();
    await begun(started, 1);

    writeFileSync(api, "export const api = { edited: true };\n");
    const second = engine.read();
    release();
    await begun(started, 2);
    release();

    expect(Object.keys((await first).routes)).toEqual(["reading1"]);
    expect(Object.keys((await second).routes)).toEqual(["reading2"]);
  });

  it("hands a call made while a failing reading ran the next one, when a file it had read changed meanwhile", async () => {
    const { evaluate, started, release } = heldEvaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    const first = engine.read().catch((error: unknown) => error);
    await begun(started, 1);

    writeFileSync(config, "export default { sources: { mended: {} } };\n");
    const second = engine.read();
    release(
      new RoutesReadError(
        "CONFIG_NOT_LOADED",
        "courier.config.ts did not load",
        { root: dir },
        {
          inputs: { configFile: config, files: [config], env: [] },
        },
      ),
    );
    await begun(started, 2);
    release();

    expect(await first).toBeInstanceOf(RoutesReadError);
    expect(Object.keys((await second).routes)).toEqual(["reading2"]);
  });

  it("shares a failing reading that names nothing it read with every call made while it ran", async () => {
    const { evaluate, started, release } = heldEvaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    const first = engine.read().catch((error: unknown) => error);
    await begun(started, 1);

    writeFileSync(api, "export const api = { edited: true };\n");
    const second = engine.read().catch((error: unknown) => error);
    release(new Error("the process ended before it answered"));

    expect(await first).toBe(await second);
    expect(started()).toBe(1);
  });

  it("keeps no failure: the next read tries again", async () => {
    let calls = 0;
    const { evaluate } = evaluator();
    const engine = createRoutesEngine({ root: dir }, (request) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("did not load")) : evaluate(request);
    });

    await expect(engine.read()).rejects.toThrow("did not load");
    await expect(engine.read()).resolves.toMatchObject({ configFile: config });
    expect(engine.last?.configFile).toBe(config);
  });

  it("asks the bundler for the variables of the env files anew for every reading", async () => {
    const { evaluate, requests } = evaluator();
    let asked = 0;
    const engine = createRoutesEngine(
      {
        root: dir,
        envValues: () => {
          asked += 1;
          return { SHOP_PUBLIC: String(asked) };
        },
      },
      evaluate,
    );
    await engine.read();

    writeFileSync(api, "export const api = { shop: true };\n");
    await engine.read();

    expect(requests.map((request) => request.env)).toEqual([
      { SHOP_PUBLIC: "1" },
      { SHOP_PUBLIC: "2" },
    ]);
  });

  it("names the config and the env files from the root, as absolute paths", async () => {
    const { evaluate, requests } = evaluator();
    const engine = createRoutesEngine(
      { root: dir, config: "config/courier.config.ts", envFiles: [".env.local", "/etc/app.env"] },
      evaluate,
    );

    await engine.read();

    expect(requests[0]).toEqual({
      root: dir,
      configFile: join(dir, "config/courier.config.ts"),
      envFiles: [join(dir, ".env.local"), "/etc/app.env"],
      env: undefined,
    });
  });

  it("gives no fingerprint while the latest reading may have missed a change made as it ran", async () => {
    const { evaluate } = evaluator(undefined, () => {
      writeFileSync(api, `export const api = ${Date.now()};\n`);
    });
    const engine = createRoutesEngine({ root: dir }, evaluate);

    await engine.read();

    expect(engine.fingerprint()).toBeUndefined();
  });

  it("gives a fingerprint that holds while nothing changes, and moves when a file does", async () => {
    const { evaluate } = evaluator();
    const engine = createRoutesEngine({ root: dir }, evaluate);
    expect(engine.fingerprint()).toBeUndefined();
    await engine.read();

    const before = engine.fingerprint();
    writeFileSync(api, "export const api = { moved: true };\n");

    expect(engine.fingerprint()).not.toBe(before);
    expect(engine.fingerprint()).toBe(engine.fingerprint());
  });
});
